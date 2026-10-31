import { Database } from "bun:sqlite";
import { DB_FILE, TICK_MS, TIMEZONE, OPEN_SIGNUP, PORT } from "./config";
import { openDb, getSetting, setSetting } from "./db";
import { createApp } from "./app";
import { tick } from "./runner";
import { logger } from "./logger";
import crypto from "node:crypto";

export function bootstrapAdmin(db: Database): void {
	const hasAdmin = db.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
	if (hasAdmin) return;
	const email = process.env.EZCHRONO_ADMIN_EMAIL?.toLowerCase();
	const password = process.env.EZCHRONO_ADMIN_PASSWORD;
	if (!email || !password) {
		logger.warn("No admin yet. Set EZCHRONO_ADMIN_EMAIL and EZCHRONO_ADMIN_PASSWORD and restart.");
		return;
	}
	if (password.length < 10) throw new Error("EZCHRONO_ADMIN_PASSWORD must be at least 10 characters");
	db.run(
		`INSERT INTO users (id, email, password_hash, role, max_jobs, max_runs_per_day,
			min_interval_seconds, created_at) VALUES (?, ?, ?, 'admin', 1000, 100000, 60, ?)`,
		[crypto.randomUUID(), email, Bun.password.hashSync(password, "argon2id"), Date.now()],
	);
	logger.info(`Bootstrapped admin ${email}`);
}

export function getOrCreateSecret(db: Database): string {
	if (process.env.EZCHRONO_SECRET) return process.env.EZCHRONO_SECRET;
	const existing = getSetting(db, "session_secret");
	if (existing) return existing;
	const fresh = crypto.randomBytes(32).toString("hex");
	setSetting(db, "session_secret", fresh);
	return fresh;
}

if (import.meta.main) {
	const db = openDb(DB_FILE);
	bootstrapAdmin(db);
	const secret = getOrCreateSecret(db);
	const deps = { db, secret, openSignup: OPEN_SIGNUP, timezone: TIMEZONE };
	const app = createApp(deps).listen(PORT);
	setInterval(() => {
		tick(db, TIMEZONE).catch((err) => logger.error("scheduler tick failed", err));
	}, TICK_MS);
	logger.info(`ezchrono listening on :${PORT} (tick ${TICK_MS} ms, tz ${TIMEZONE})`);
	process.on("SIGTERM", () => {
		app.stop();
		db.close();
		process.exit(0);
	});
}
