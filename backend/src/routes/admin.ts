import { Elysia, t } from "elysia";
import { ApiError, parseLimit, requireAdmin, type Deps } from "../http";
import { runsLast24h } from "../runner";

export function adminRoutes(deps: Deps) {
	const { db } = deps;

	const userOr404 = (id: string) => {
		const row = db.query("SELECT id FROM users WHERE id = ?").get(id);
		if (!row) throw new ApiError(404, "User not found");
	};

	return new Elysia({ prefix: "/admin" })
		.get("/overview", ({ cookie }) => {
			requireAdmin(deps, cookie);
			const since = Date.now() - 24 * 60 * 60 * 1000;
			const totals = db
				.query(
					`SELECT
						(SELECT COUNT(*) FROM users) AS users,
						(SELECT COUNT(*) FROM users WHERE disabled = 1) AS disabled_users,
						(SELECT COUNT(*) FROM jobs) AS jobs,
						(SELECT COUNT(*) FROM jobs WHERE enabled = 1) AS enabled_jobs,
						(SELECT COUNT(*) FROM runs WHERE started_at > ? AND status != 'quota') AS runs_24h,
						(SELECT COUNT(*) FROM runs WHERE started_at > ? AND status NOT IN ('ok', 'quota')) AS failed_24h`,
				)
				.get(since, since);
			return totals;
		})
		.get("/users", ({ cookie }) => {
			requireAdmin(deps, cookie);
			const since = Date.now() - 24 * 60 * 60 * 1000;
			const rows = db
				.query(
					`SELECT u.id, u.email, u.role, u.disabled, u.max_jobs, u.max_runs_per_day,
						u.min_interval_seconds, u.created_at,
						(SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id) AS job_count,
						(SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id AND r.started_at > ?
							AND r.status != 'quota') AS runs_24h
					 FROM users u ORDER BY u.created_at`,
				)
				.all(since);
			return { users: rows };
		})
		.patch(
			"/users/:id",
			({ cookie, params, body }) => {
				const admin = requireAdmin(deps, cookie);
				userOr404(params.id);
				if (params.id === admin.id && (body.disabled === true || body.role === "user")) {
					throw new ApiError(400, "You cannot disable or demote your own account");
				}
				const sets: string[] = [];
				const vals: (string | number)[] = [];
				if (body.role !== undefined) { sets.push("role = ?"); vals.push(body.role); }
				if (body.disabled !== undefined) { sets.push("disabled = ?"); vals.push(body.disabled ? 1 : 0); }
				if (body.max_jobs !== undefined) { sets.push("max_jobs = ?"); vals.push(body.max_jobs); }
				if (body.max_runs_per_day !== undefined) { sets.push("max_runs_per_day = ?"); vals.push(body.max_runs_per_day); }
				if (body.min_interval_seconds !== undefined) { sets.push("min_interval_seconds = ?"); vals.push(body.min_interval_seconds); }
				if (body.password !== undefined) {
					sets.push("password_hash = ?");
					vals.push(Bun.password.hashSync(body.password, "argon2id"));
				}
				if (sets.length) {
					db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...vals, params.id]);
				}
				return { ok: true };
			},
			{
				body: t.Partial(
					t.Object({
						role: t.Union([t.Literal("admin"), t.Literal("user")]),
						disabled: t.Boolean(),
						max_jobs: t.Integer({ minimum: 0, maximum: 10000 }),
						max_runs_per_day: t.Integer({ minimum: 0, maximum: 100000 }),
						min_interval_seconds: t.Integer({ minimum: 60, maximum: 86400 }),
					password: t.String({ minLength: 10, maxLength: 200 }),
					}),
				),
			},
		)
		.delete("/users/:id", ({ cookie, params, set }) => {
			const admin = requireAdmin(deps, cookie);
			if (params.id === admin.id) throw new ApiError(400, "You cannot delete your own account");
			userOr404(params.id);
			db.run("DELETE FROM users WHERE id = ?", [params.id]);
			set.status = 204;
			return null;
		})
		.get("/jobs", ({ cookie, query }) => {
			requireAdmin(deps, cookie);
			const limit = parseLimit(query.limit, 200, 1000);
			const rows = db
				.query(
					`SELECT j.id, j.name, j.schedule, j.target_url, j.method, j.enabled,
						j.next_run_at, j.last_run_at, j.last_status, j.created_at,
						u.email AS owner
					 FROM jobs j JOIN users u ON u.id = j.user_id
					 ORDER BY j.created_at DESC LIMIT ?`,
				)
				.all(limit);
			return { jobs: rows };
		}, { query: t.Object({ limit: t.Optional(t.String()) }) })
		.get("/users/:id/usage", ({ cookie, params }) => {
			requireAdmin(deps, cookie);
			userOr404(params.id);
			const user = db
				.query("SELECT max_jobs, max_runs_per_day FROM users WHERE id = ?")
				.get(params.id) as { max_jobs: number; max_runs_per_day: number };
			const jobs = (db
				.query("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ?")
				.get(params.id) as { n: number }).n;
			return {
				jobs: { used: jobs, limit: user.max_jobs },
				runs24h: { used: runsLast24h(db, params.id, Date.now()), limit: user.max_runs_per_day },
			};
		});
}
