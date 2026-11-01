import type { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { RUN_RETENTION_DAYS, VERSION } from "./config";
import { TargetError, assertPublicTarget } from "./ssrf";
import { nextRunAfter } from "./schedule";

export type RunStatus = "ok" | "failed" | "timeout" | "blocked" | "quota";
export type Trigger = "schedule" | "manual";

export interface JobRow {
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
}

export interface RunOutcome {
	id: string;
	status: RunStatus;
	http_status: number | null;
	error: string | null;
	duration_ms: number;
}

export function runsLast24h(db: Database, userId: string, now: number): number {
	const row = db
		.query(
			`SELECT COUNT(*) AS n FROM runs
			 WHERE user_id = ? AND started_at > ? AND status != 'quota'`,
		)
		.get(userId, now - 24 * 60 * 60 * 1000) as { n: number };
	return row.n;
}

// Runs currently executing (single process). Counted against the daily quota
// from the moment they start, so concurrent runs can't all pass the same check.
const inFlight = new Map<string, number>();

function bumpInFlight(userId: string, delta: number): void {
	const next = (inFlight.get(userId) ?? 0) + delta;
	if (next > 0) inFlight.set(userId, next);
	else inFlight.delete(userId);
}

/**
 * Quota remaining right now: the daily limit minus runs recorded in the last
 * 24 hours minus runs still in flight.
 */
export function quotaLeft(
	db: Database,
	userId: string,
	maxRunsPerDay: number,
	now: number = Date.now(),
): number {
	return maxRunsPerDay - runsLast24h(db, userId, now) - (inFlight.get(userId) ?? 0);
}

/** Deletes run history older than the retention window. 0 days = keep forever. */
export function pruneRuns(
	db: Database,
	retentionDays: number,
	now: number = Date.now(),
): number {
	if (retentionDays <= 0) return 0;
	return db.run("DELETE FROM runs WHERE started_at < ?", [
		now - retentionDays * 24 * 60 * 60 * 1000,
	]).changes;
}

function recordRun(
	db: Database,
	job: JobRow,
	trigger: Trigger,
	outcome: Omit<RunOutcome, "id"> & { started_at: number },
): RunOutcome {
	const id = crypto.randomUUID();
	db.transaction(() => {
		db.run(
			`INSERT INTO runs (id, job_id, user_id, trigger, started_at, finished_at,
				duration_ms, status, http_status, error)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				id,
				job.id,
				job.user_id,
				trigger,
				outcome.started_at,
				outcome.started_at + outcome.duration_ms,
				outcome.duration_ms,
				outcome.status,
				outcome.http_status,
				outcome.error,
			],
		);
		db.run(
			"UPDATE jobs SET last_run_at = ?, last_status = ? WHERE id = ?",
			[outcome.started_at, outcome.status, job.id],
		);
	})();
	return { id, ...outcome };
}

/**
 * Calls the job's target once. Never throws: every outcome becomes a run row.
 * The in-flight counter is bumped on the first synchronous line, so a quota
 * check in the same event-loop turn already sees this run.
 */
export async function performRun(
	db: Database,
	job: JobRow,
	trigger: Trigger,
	now: number = Date.now(),
): Promise<RunOutcome> {
	bumpInFlight(job.user_id, 1);
	try {
		return await executeRun(db, job, trigger, now);
	} finally {
		bumpInFlight(job.user_id, -1);
	}
}

async function executeRun(
	db: Database,
	job: JobRow,
	trigger: Trigger,
	now: number,
): Promise<RunOutcome> {
	const started = Date.now();
	let status: RunStatus;
	let httpStatus: number | null = null;
	let error: string | null = null;

	try {
		await assertPublicTarget(job.target_url);
		const isPost = job.method === "POST";
		const res = await fetch(job.target_url, {
			method: job.method,
			body: isPost ? (job.body ?? undefined) : undefined,
			redirect: "manual", // a redirect could point at a private host
			headers: {
				"user-agent": `ezchrono/${VERSION}`,
				...(isPost ? { "content-type": "application/json" } : {}),
			},
			signal: AbortSignal.timeout(job.timeout_ms),
		});
		httpStatus = res.status;
		await res.body?.cancel();
		if (res.status >= 200 && res.status < 300) {
			status = "ok";
		} else {
			status = "failed";
			error =
				res.status >= 300 && res.status < 400
					? "Redirects are not followed; point the job at the final URL"
					: `HTTP ${res.status}`;
		}
	} catch (err) {
		if (err instanceof TargetError) {
			status = "blocked";
			error = err.message;
		} else if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
			status = "timeout";
			error = `No response within ${job.timeout_ms} ms`;
		} else {
			status = "failed";
			error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
		}
	}

	return recordRun(db, job, trigger, {
		status,
		http_status: httpStatus,
		error,
		duration_ms: Date.now() - started,
		started_at: now,
	});
}

/**
 * One scheduler pass: find due jobs, claim each one by moving next_run_at
 * forward (so two passes can't fire the same slot), apply the daily run quota,
 * then run the rest concurrently.
 */
export async function tick(
	db: Database,
	timezone: string,
	now: number = Date.now(),
): Promise<number> {
	const due = db
		.query(
			`SELECT j.id, j.user_id, j.name, j.schedule, j.target_url, j.method, j.body,
				j.timeout_ms, j.enabled, j.next_run_at, u.max_runs_per_day
			 FROM jobs j JOIN users u ON u.id = j.user_id
			 WHERE j.enabled = 1 AND u.disabled = 0 AND j.next_run_at <= ?
			 ORDER BY j.next_run_at LIMIT 100`,
		)
		.all(now) as (JobRow & { max_runs_per_day: number })[];

	const work: Promise<unknown>[] = [];
	for (const job of due) {
		let next: Date | null;
		try {
			next = nextRunAfter(job.schedule, timezone, new Date(now));
		} catch {
			// A schedule that was valid when saved but no longer parses: stop it
			// rather than spin on it every tick.
			db.run(
				"UPDATE jobs SET enabled = 0, next_run_at = NULL, last_status = 'invalid_schedule' WHERE id = ?",
				[job.id],
			);
			continue;
		}
		const claimed = db.run(
			"UPDATE jobs SET next_run_at = ? WHERE id = ? AND next_run_at = ?",
			[next?.getTime() ?? null, job.id, job.next_run_at],
		).changes;
		if (claimed === 0) continue;

		if (quotaLeft(db, job.user_id, job.max_runs_per_day, now) <= 0) {
			recordRun(db, job, "schedule", {
				status: "quota",
				http_status: null,
				error: "Daily run quota reached; this run was skipped",
				duration_ms: 0,
				started_at: now,
			});
			continue;
		}
		work.push(performRun(db, job, "schedule", now));
	}
	await Promise.allSettled(work);
	pruneRuns(db, RUN_RETENTION_DAYS, now);
	return due.length;
}
