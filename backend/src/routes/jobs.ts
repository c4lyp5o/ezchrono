import { Elysia, t } from "elysia";
import crypto from "node:crypto";
import { ApiError, parseLimit, requireUser, type Deps } from "../http";
import { assertPublicTarget, TargetError } from "../ssrf";
import { assertValidSchedule, nextRunAfter } from "../schedule";
import { performRun, quotaLeft, runsLast24h, type JobRow } from "../runner";
import { TIMEZONE } from "../config";

const NAME = t.String({ minLength: 1, maxLength: 80 });
const SCHEDULE = t.String({ minLength: 5, maxLength: 120 });
const URL_FIELD = t.String({ minLength: 8, maxLength: 2048 });

const JOB_FIELDS = {
	name: NAME,
	schedule: SCHEDULE,
	target_url: URL_FIELD,
	method: t.Optional(t.Union([t.Literal("GET"), t.Literal("POST")])),
	body: t.Optional(t.Nullable(t.String({ maxLength: 4096 }))),
	timeout_ms: t.Optional(t.Integer({ minimum: 1000, maximum: 30000 })),
	enabled: t.Optional(t.Boolean()),
};

/** Row shape straight from the jobs table. */
interface JobRecord {
	id: string;
	user_id: string;
	name: string;
	schedule: string;
	target_url: string;
	method: "GET" | "POST";
	body: string | null;
	timeout_ms: number;
	enabled: number;
	next_run_at: number | null;
	last_run_at: number | null;
	last_status: string | null;
	created_at: number;
	updated_at: number;
}

function jobView(row: JobRecord | Record<string, unknown>) {
	return {
		id: row.id,
		name: row.name,
		schedule: row.schedule,
		target_url: row.target_url,
		method: row.method,
		body: row.body,
		timeout_ms: row.timeout_ms,
		enabled: Boolean(row.enabled),
		next_run_at: row.next_run_at,
		last_run_at: row.last_run_at,
		last_status: row.last_status,
		created_at: row.created_at,
	};
}

export function jobRoutes(deps: Deps) {
	const { db, timezone } = deps;

	// Loads a job the caller owns. Anyone else gets a 404, not a 403, so job IDs
	// can't be used to probe other tenants.
	const ownJob = (userId: string, id: string) => {
		const row = db
			.query("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
			.get(id, userId) as JobRecord | null;
		if (!row) throw new ApiError(404, "Job not found");
		return row;
	};

	return new Elysia({ prefix: "/jobs" })
		.get("/", ({ cookie }) => {
			const user = requireUser(deps, cookie);
			const rows = db
				.query("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC")
				.all(user.id) as Record<string, unknown>[];
			return { jobs: rows.map(jobView) };
		})
		.get("/usage", ({ cookie }) => {
			const user = requireUser(deps, cookie);
			const now = Date.now();
			const jobs = (db
				.query("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ?")
				.get(user.id) as { n: number }).n;
			return {
				jobs: { used: jobs, limit: user.max_jobs },
				runs24h: { used: runsLast24h(db, user.id, now), limit: user.max_runs_per_day },
				minIntervalSeconds: user.min_interval_seconds,
			};
		})
		.post(
			"/",
			async ({ cookie, body, set }) => {
				const user = requireUser(deps, cookie);
				const count = (db
					.query("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ?")
					.get(user.id) as { n: number }).n;
				if (count >= user.max_jobs) {
					throw new ApiError(403, `Job limit reached (${user.max_jobs})`);
				}
				const method = body.method ?? "GET";
				if (method === "GET" && body.body) {
					throw new ApiError(400, "A GET job cannot have a body");
				}
				assertValidSchedule(body.schedule, timezone, user.min_interval_seconds);
				try {
					await assertPublicTarget(body.target_url);
				} catch (err) {
					if (err instanceof TargetError) throw new ApiError(400, err.message);
					throw err;
				}
				const now = new Date();
				const next = nextRunAfter(body.schedule, timezone, now);
				const id = crypto.randomUUID();
				const ts = now.getTime();
				db.run(
					`INSERT INTO jobs (id, user_id, name, schedule, target_url, method, body,
						timeout_ms, enabled, next_run_at, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						id,
						user.id,
						body.name,
						body.schedule,
						body.target_url,
						method,
						body.body ?? null,
						body.timeout_ms ?? 10000,
						body.enabled === false ? 0 : 1,
						next?.getTime() ?? null,
						ts,
						ts,
					],
				);
				set.status = 201;
				return jobView(ownJob(user.id, id));
			},
			{ body: t.Object(JOB_FIELDS) },
		)
		.get("/:id", ({ cookie, params }) => {
			const user = requireUser(deps, cookie);
			return jobView(ownJob(user.id, params.id));
		})
		.patch(
			"/:id",
			async ({ cookie, params, body }) => {
				const user = requireUser(deps, cookie);
				const current = ownJob(user.id, params.id);
				const next = {
					name: body.name ?? current.name,
					schedule: body.schedule ?? current.schedule,
					target_url: body.target_url ?? current.target_url,
					method: body.method ?? current.method,
					body: body.body !== undefined ? body.body : current.body,
					timeout_ms: body.timeout_ms ?? current.timeout_ms,
					enabled: body.enabled ?? current.enabled === 1,
				};
				if (next.method === "GET" && next.body) {
					throw new ApiError(400, "A GET job cannot have a body");
				}
				if (body.schedule !== undefined || body.enabled === true) {
					assertValidSchedule(next.schedule, timezone, user.min_interval_seconds);
				}
				if (body.target_url !== undefined) {
					try {
						await assertPublicTarget(next.target_url);
					} catch (err) {
						if (err instanceof TargetError) throw new ApiError(400, err.message);
						throw err;
					}
				}
				const now = new Date();
				// Recompute the next run whenever the schedule changes or the job is re-enabled.
				const rescheduled =
					body.schedule !== undefined || (body.enabled === true && current.enabled === 0);
				const nextRunAt = !next.enabled
					? null
					: rescheduled
						? (nextRunAfter(next.schedule, timezone, now)?.getTime() ?? null)
						: current.next_run_at;
				db.run(
					`UPDATE jobs SET name = ?, schedule = ?, target_url = ?, method = ?, body = ?,
						timeout_ms = ?, enabled = ?, next_run_at = ?, updated_at = ?
					 WHERE id = ? AND user_id = ?`,
					[
						next.name,
						next.schedule,
						next.target_url,
						next.method,
						next.body ?? null,
						next.timeout_ms,
						next.enabled ? 1 : 0,
						nextRunAt,
						now.getTime(),
						params.id,
						user.id,
					],
				);
				return jobView(ownJob(user.id, params.id));
			},
			{ body: t.Partial(t.Object(JOB_FIELDS)) },
		)
		.delete("/:id", ({ cookie, params, set }) => {
			const user = requireUser(deps, cookie);
			ownJob(user.id, params.id);
			db.run("DELETE FROM jobs WHERE id = ? AND user_id = ?", [params.id, user.id]);
			set.status = 204;
			return null;
		})
		.post("/:id/run", async ({ cookie, params }) => {
			const user = requireUser(deps, cookie);
			const job = ownJob(user.id, params.id) as unknown as JobRow;
			// Manual runs count against the same daily quota as scheduled ones,
			// in-flight runs included so concurrent requests can't overshoot.
			if (quotaLeft(db, user.id, user.max_runs_per_day) <= 0) {
				throw new ApiError(429, "Daily run quota reached");
			}
			return performRun(db, job, "manual");
		})
		.get("/:id/runs", ({ cookie, params, query }) => {
			const user = requireUser(deps, cookie);
			ownJob(user.id, params.id);
			const limit = parseLimit(query.limit, 50, 200);
			const rows = db
				.query(
					`SELECT id, trigger, started_at, duration_ms, status, http_status, error
					 FROM runs WHERE job_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT ?`,
				)
				.all(params.id, user.id, limit);
			return { runs: rows };
		}, { query: t.Object({ limit: t.Optional(t.String()) }) });
}

