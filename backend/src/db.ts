import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS: string[] = [
	`
	CREATE TABLE users (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
		disabled INTEGER NOT NULL DEFAULT 0,
		max_jobs INTEGER NOT NULL,
		max_runs_per_day INTEGER NOT NULL,
		min_interval_seconds INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE jobs (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		schedule TEXT NOT NULL,
		target_url TEXT NOT NULL,
		method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST')),
		body TEXT,
		timeout_ms INTEGER NOT NULL DEFAULT 10000,
		enabled INTEGER NOT NULL DEFAULT 1,
		next_run_at INTEGER,
		last_run_at INTEGER,
		last_status TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX jobs_due ON jobs (enabled, next_run_at);
	CREATE INDEX jobs_user ON jobs (user_id);
	CREATE TABLE runs (
		id TEXT PRIMARY KEY,
		job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'manual')),
		started_at INTEGER NOT NULL,
		finished_at INTEGER,
		duration_ms INTEGER,
		status TEXT NOT NULL,
		http_status INTEGER,
		error TEXT
	);
	CREATE INDEX runs_user_started ON runs (user_id, started_at);
	CREATE INDEX runs_job_started ON runs (job_id, started_at);
	CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	`,
];

export function openDb(file: string): Database {
	if (file !== ":memory:") {
		mkdirSync(path.dirname(file), { recursive: true });
	}
	const db = new Database(file, { create: true });
	db.exec(
		"PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
	);
	migrate(db);
	return db;
}

export function migrate(db: Database): void {
	const current = (db.query("PRAGMA user_version").get() as { user_version: number })
		.user_version;
	for (let v = current; v < MIGRATIONS.length; v++) {
		db.transaction(() => {
			db.exec(MIGRATIONS[v]);
			db.exec(`PRAGMA user_version = ${v + 1}`);
		})();
	}
}

export function getSetting(db: Database, key: string): string | null {
	const row = db
		.query("SELECT value FROM settings WHERE key = ?")
		.get(key) as { value: string } | null;
	return row?.value ?? null;
}

export function setSetting(db: Database, key: string, value: string): void {
	db.run(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		[key, value],
	);
}
