import type { Database } from "bun:sqlite";
import { SESSION_COOKIE, verifyToken } from "./session";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export interface Deps {
	db: Database;
	secret: string;
	openSignup: boolean;
	timezone: string;
	/** Overrides where the built client is served from. Defaults to CLIENT_DIR. */
	clientDir?: string;
}

export interface AuthUser {
	id: string;
	email: string;
	role: "admin" | "user";
	max_jobs: number;
	max_runs_per_day: number;
	min_interval_seconds: number;
}

export type CookieJar = Record<string, { value?: unknown }>;

/**
 * Resolves the signed-in user from the session cookie. The user row is read on
 * every request, so disabling an account or demoting an admin takes effect at
 * once rather than when the cookie expires.
 */
export function currentUser(deps: Deps, cookie: CookieJar): AuthUser | null {
	const token = cookie[SESSION_COOKIE]?.value;
	if (typeof token !== "string" || !token) return null;
	const userId = verifyToken(token, deps.secret);
	if (!userId) return null;
	const row = deps.db
		.query(
			`SELECT id, email, role, disabled, max_jobs, max_runs_per_day, min_interval_seconds
			 FROM users WHERE id = ?`,
		)
		.get(userId) as (AuthUser & { disabled: number }) | null;
	if (!row || row.disabled) return null;
	return row;
}

export function requireUser(deps: Deps, cookie: CookieJar): AuthUser {
	const user = currentUser(deps, cookie);
	if (!user) throw new ApiError(401, "Not signed in");
	return user;
}

export function requireAdmin(deps: Deps, cookie: CookieJar): AuthUser {
	const user = requireUser(deps, cookie);
	if (user.role !== "admin") throw new ApiError(403, "Admins only");
	return user;
}

/**
 * Parses a ?limit= query value: non-numeric falls back to the default, and the
 * result is clamped to [1, max] — never NaN, zero or negative.
 */
export function parseLimit(raw: string | undefined, fallback: number, max: number): number {
	if (raw === undefined || raw === "") return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(Math.max(Math.trunc(n), 1), max);
}
