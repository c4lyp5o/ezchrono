import { Elysia, t } from "elysia";
import crypto from "node:crypto";
import { DEFAULT_QUOTA, SESSION_TTL_SECONDS } from "../config";
import { SESSION_COOKIE, signToken } from "../session";
import { ApiError, currentUser, type Deps } from "../http";

const EMAIL = t.String({ format: "email", maxLength: 254 });
const PASSWORD = t.String({ minLength: 10, maxLength: 200 });

// Per-email failure counter: 10 wrong passwords in 15 minutes locks sign-in
// for that address for the rest of the window. In-memory, so it resets on restart.
const failures = new Map<string, { count: number; since: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function checkLoginAllowed(email: string, now: number): void {
	const f = failures.get(email);
	if (f && now - f.since < WINDOW_MS && f.count >= MAX_FAILURES) {
		throw new ApiError(429, "Too many failed attempts; try again later");
	}
}

function recordFailure(email: string, now: number): void {
	const f = failures.get(email);
	if (!f || now - f.since >= WINDOW_MS) failures.set(email, { count: 1, since: now });
	else f.count++;
}

export function authRoutes(deps: Deps) {
	const { db, secret, openSignup } = deps;
	return new Elysia({ prefix: "/auth" })
		.post(
			"/signup",
			({ body, set }) => {
				if (!openSignup) throw new ApiError(403, "Sign-up is by invitation only");
				const email = body.email.toLowerCase();
				const exists = db.query("SELECT 1 FROM users WHERE email = ?").get(email);
				if (exists) throw new ApiError(409, "Email already registered");
				const id = crypto.randomUUID();
				const hash = Bun.password.hashSync(body.password, "argon2id");
				db.run(
					`INSERT INTO users (id, email, password_hash, role, max_jobs, max_runs_per_day,
						min_interval_seconds, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`,
					[
						id,
						email,
						hash,
						DEFAULT_QUOTA.maxJobs,
						DEFAULT_QUOTA.maxRunsPerDay,
						DEFAULT_QUOTA.minIntervalSeconds,
						Date.now(),
					],
				);
				set.status = 201;
				return { id, email };
			},
			{ body: t.Object({ email: EMAIL, password: PASSWORD }) },
		)
		.post(
			"/login",
			({ body, cookie }) => {
				const now = Date.now();
				const email = body.email.toLowerCase();
				checkLoginAllowed(email, now);
				const row = db
					.query("SELECT id, password_hash, disabled FROM users WHERE email = ?")
					.get(email) as { id: string; password_hash: string; disabled: number } | null;
				// Hash even when the user is unknown, so timing doesn't reveal which emails exist.
				const ok = Bun.password.verifySync(
					body.password,
					row?.password_hash ?? DUMMY_HASH,
				);
				if (!row || !ok || row.disabled) {
					recordFailure(email, now);
					throw new ApiError(401, "Invalid email or password");
				}
				failures.delete(email);
				cookie[SESSION_COOKIE].set({
					value: signToken(row.id, secret, SESSION_TTL_SECONDS),
					httpOnly: true,
					sameSite: "strict",
					secure: process.env.NODE_ENV === "production",
					path: "/",
					maxAge: SESSION_TTL_SECONDS,
				});
				return { ok: true };
			},
			{ body: t.Object({ email: EMAIL, password: t.String({ maxLength: 200 }) }) },
		)
		.post("/logout", ({ cookie }) => {
			cookie[SESSION_COOKIE].remove();
			return { ok: true };
		})
		.get("/me", ({ cookie }) => {
			const user = currentUser(deps, cookie);
			if (!user) throw new ApiError(401, "Not signed in");
			return {
				id: user.id,
				email: user.email,
				role: user.role,
				quota: {
					maxJobs: user.max_jobs,
					maxRunsPerDay: user.max_runs_per_day,
					minIntervalSeconds: user.min_interval_seconds,
				},
			};
		});
}

// A real Argon2id hash of a random string, computed once. Only used to keep
// login timing flat for unknown emails.
const DUMMY_HASH = Bun.password.hashSync(crypto.randomBytes(16).toString("hex"), "argon2id");
