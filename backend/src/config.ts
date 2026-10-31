import path from "node:path";
import pkg from "../../package.json";

export const VERSION: string = pkg.version;

export const PORT = Number(process.env.PORT ?? 5100);
export const DB_FILE =
	process.env.EZCHRONO_DB ?? path.resolve(process.cwd(), "data/ezchrono.db");
export const CLIENT_DIR =
	process.env.EZCHRONO_CLIENT_DIR ??
	path.resolve(import.meta.dir, "../../client");
export const TICK_MS = Number(process.env.EZCHRONO_TICK_MS ?? 15_000);
export const TIMEZONE = process.env.EZCHRONO_TZ ?? "UTC";
export const OPEN_SIGNUP = process.env.EZCHRONO_OPEN_SIGNUP === "1";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// Defaults for a new tenant. Admins override them per user.
export const DEFAULT_QUOTA = {
	maxJobs: 5,
	maxRunsPerDay: 288, // one run every 5 minutes, around the clock
	minIntervalSeconds: 300,
} as const;

// Only for local development and tests: lets targets resolve to private
// addresses. Never set this on a multi-tenant deployment.
export const allowPrivateTargets = () =>
	process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS === "1";
