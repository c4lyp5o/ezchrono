import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { tick, performRun, type JobRow } from "../src/runner";
import { signToken, verifyToken } from "../src/session";
import { assertValidSchedule, nextRunAfter } from "../src/schedule";
import { isPrivateAddress, assertPublicTarget } from "../src/ssrf";

const SECRET = "test-secret-test-secret-test-secret";
const PASSWORD = "correct-horse-battery";

let db: Database;
let app: ReturnType<typeof createApp>;
let fakeTarget: ReturnType<typeof Bun.serve>;
const hits = new Map<string, number>();
const hitCount = (path: string) => hits.get(path) ?? 0;

beforeAll(() => {
	process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS = "1";
	process.env.EZCHRONO_OPEN_SIGNUP = "1";
	db = openDb(":memory:");
	fakeTarget = Bun.serve({
		port: 0,
		fetch(req) {
			const url = new URL(req.url);
			hits.set(url.pathname, hitCount(url.pathname) + 1);
			if (url.pathname === "/ok") return new Response("fine");
			if (url.pathname === "/boom") return new Response("no", { status: 500 });
			if (url.pathname === "/slow") return new Promise((r) => setTimeout(() => r(new Response("late")), 2000));
			if (url.pathname === "/count") return new Response("counted");
			if (url.pathname === "/redirect") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
			return new Response("hit");
		},
	});
	app = createApp({ db, secret: SECRET, openSignup: true, timezone: "UTC" });
});

afterAll(() => {
	fakeTarget.stop(true);
	db.close();
	delete process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS;
});

const base = () => `http://localhost/api/v1`;
const target = (path = "/ok") => `http://127.0.0.1:${fakeTarget.port}${path}`;

async function api(path: string, init: RequestInit = {}, cookie?: string) {
	const headers = new Headers(init.headers);
	if (init.body) headers.set("content-type", "application/json");
	if (cookie) headers.set("cookie", cookie);
	const res = await app.handle(new Request(base() + path, { ...init, headers }));
	const text = await res.text();
	return { status: res.status, json: text ? JSON.parse(text) : null, setCookie: res.headers.get("set-cookie") };
}

function sessionFrom(setCookie: string | null): string {
	const m = /ezchrono_session=([^;]+)/.exec(setCookie ?? "");
	if (!m) throw new Error("no session cookie");
	return `ezchrono_session=${m[1]}`;
}

async function makeUser(email: string, extra: Record<string, unknown> = {}) {
	await api("/auth/signup", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
	if (Object.keys(extra).length) {
		db.run(
			"UPDATE users SET max_jobs = COALESCE(?, max_jobs), max_runs_per_day = COALESCE(?, max_runs_per_day), min_interval_seconds = COALESCE(?, min_interval_seconds) WHERE email = ?",
			[(extra.max_jobs as number) ?? null, (extra.max_runs_per_day as number) ?? null, (extra.min_interval_seconds as number) ?? null, email],
		);
	}
	const login = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
	return sessionFrom(login.setCookie);
}

function makeAdmin(email: string): string {
	db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
	return email;
}

describe("session tokens", () => {
	test("round-trips a user id", () => {
		const t = signToken("user-1", SECRET, 60);
		expect(verifyToken(t, SECRET)).toBe("user-1");
	});
	test("rejects a wrong secret", () => {
		expect(verifyToken(signToken("u", SECRET, 60), "other")).toBeNull();
	});
	test("rejects an expired token", () => {
		const t = signToken("u", SECRET, 10, 0);
		expect(verifyToken(t, SECRET, 60_000)).toBeNull();
	});
	test("rejects a tampered payload", () => {
		const t = signToken("u", SECRET, 60);
		const [, sig] = t.split(".");
		const forged = Buffer.from(JSON.stringify({ sub: "admin", exp: 9999999999 })).toString("base64url");
		expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
	});
	test("rejects garbage", () => {
		expect(verifyToken("nope", SECRET)).toBeNull();
		expect(verifyToken("", SECRET)).toBeNull();
	});
});

describe("schedules", () => {
	test("next run is computed in the given timezone", () => {
		const next = nextRunAfter("0 9 * * *", "Asia/Kuala_Lumpur", new Date("2026-01-01T00:00:00Z"));
		expect(next?.toISOString()).toBe("2026-01-01T01:00:00.000Z");
	});
	test("rejects a schedule under the minimum interval", () => {
		expect(() => assertValidSchedule("* * * * *", "UTC", 300)).toThrow(/every 60s/);
	});
	test("accepts a schedule at or above the minimum interval", () => {
		expect(() => assertValidSchedule("*/5 * * * *", "UTC", 300)).not.toThrow();
	});
	test("rejects an unparseable schedule", () => {
		expect(() => assertValidSchedule("not a cron", "UTC", 60)).toThrow(/Invalid schedule/);
	});
});

describe("SSRF guard", () => {
	test("flags private, loopback, link-local and metadata addresses", () => {
		for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "192.168.1.1", "172.20.0.5", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
			expect(isPrivateAddress(ip)).toBe(true);
		}
	});
	test("allows public addresses", () => {
		expect(isPrivateAddress("8.8.8.8")).toBe(false);
		expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
	});
	test("refuses non-http schemes and embedded credentials", async () => {
		process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS = "";
		try {
			await expect(assertPublicTarget("file:///etc/passwd")).rejects.toThrow(/http and https/);
			await expect(assertPublicTarget("https://user:pw@example.com/")).rejects.toThrow(/Credentials/);
			await expect(assertPublicTarget("http://127.0.0.1/")).rejects.toThrow(/private/);
		} finally {
			process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS = "1";
		}
	});
});

describe("auth", () => {
	test("signup, login, me", async () => {
		const email = "auth-a@example.com";
		const s = await api("/auth/signup", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
		expect(s.status).toBe(201);
		const login = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
		expect(login.status).toBe(200);
		expect(login.setCookie).toContain("HttpOnly");
		const me = await api("/auth/me", {}, sessionFrom(login.setCookie));
		expect(me.json.email).toBe(email);
		expect(me.json.quota.maxJobs).toBe(5);
	});
	test("duplicate signup is a conflict and emails are case-insensitive", async () => {
		await api("/auth/signup", { method: "POST", body: JSON.stringify({ email: "dup@example.com", password: PASSWORD }) });
		const again = await api("/auth/signup", { method: "POST", body: JSON.stringify({ email: "DUP@example.com", password: PASSWORD }) });
		expect(again.status).toBe(409);
	});
	test("wrong password is 401, same message for unknown email", async () => {
		await api("/auth/signup", { method: "POST", body: JSON.stringify({ email: "wp@example.com", password: PASSWORD }) });
		const a = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "wp@example.com", password: "wrong-wrong-wrong" }) });
		const b = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "nobody@example.com", password: "wrong-wrong-wrong" }) });
		expect(a.status).toBe(401);
		expect(b.status).toBe(401);
		expect(a.json).toEqual(b.json);
	});
	test("a disabled account cannot sign in or keep using a live cookie", async () => {
		const email = "disabled@example.com";
		const cookie = await makeUser(email);
		db.run("UPDATE users SET disabled = 1 WHERE email = ?", [email]);
		expect((await api("/auth/me", {}, cookie)).status).toBe(401);
		const login = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
		expect(login.status).toBe(401);
	});
	test("too many failures locks the email", async () => {
		const email = "lockout@example.com";
		await api("/auth/signup", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
		for (let i = 0; i < 10; i++) {
			await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password: "wrong-wrong-wrong" }) });
		}
		const locked = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
		expect(locked.status).toBe(429);
	});
	test("requires a session for protected routes", async () => {
		expect((await api("/jobs")).status).toBe(401);
	});
});

describe("jobs", () => {
	beforeEach(() => {
		db.run("DELETE FROM runs");
	});

	test("create, list, get, patch, delete a job", async () => {
		const cookie = await makeUser("jobs-crud@example.com");
		const created = await api(
			"/jobs",
			{ method: "POST", body: JSON.stringify({ name: "ping", schedule: "*/5 * * * *", target_url: target() }) },
			cookie,
		);
		expect(created.status).toBe(201);
		const id = created.json.id;
		expect(created.json.next_run_at).toBeGreaterThan(Date.now());

		expect((await api(`/jobs/${id}`, {}, cookie)).json.name).toBe("ping");
		const patched = await api(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: false }) }, cookie);
		expect(patched.json.enabled).toBe(false);
		expect(patched.json.next_run_at).toBeNull();

		expect((await api(`/jobs/${id}`, { method: "DELETE" }, cookie)).status).toBe(204);
		expect((await api(`/jobs/${id}`, {}, cookie)).status).toBe(404);
	});

	test("enforces the per-user job limit", async () => {
		const cookie = await makeUser("limit@example.com", { max_jobs: 1 });
		const body = JSON.stringify({ name: "a", schedule: "*/5 * * * *", target_url: target() });
		expect((await api("/jobs", { method: "POST", body }, cookie)).status).toBe(201);
		const second = await api("/jobs", { method: "POST", body }, cookie);
		expect(second.status).toBe(403);
	});

	test("enforces the minimum interval", async () => {
		const cookie = await makeUser("interval@example.com", { min_interval_seconds: 600 });
		const res = await api(
			"/jobs",
			{ method: "POST", body: JSON.stringify({ name: "fast", schedule: "*/5 * * * *", target_url: target() }) },
			cookie,
		);
		expect(res.status).toBe(400);
		expect(res.json.error).toMatch(/minimum interval/);
	});

	test("a user cannot read, patch, run or delete another user's job", async () => {
		const owner = await makeUser("owner@example.com");
		const other = await makeUser("intruder@example.com");
		const { json } = await api(
			"/jobs",
			{ method: "POST", body: JSON.stringify({ name: "mine", schedule: "*/5 * * * *", target_url: target() }) },
			owner,
		);
		const id = json.id;
		expect((await api(`/jobs/${id}`, {}, other)).status).toBe(404);
		expect((await api(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ name: "x" }) }, other)).status).toBe(404);
		expect((await api(`/jobs/${id}/run`, { method: "POST" }, other)).status).toBe(404);
		expect((await api(`/jobs/${id}`, { method: "DELETE" }, other)).status).toBe(404);
	});

	test("refuses a private target at creation", async () => {
		process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS = "";
		try {
			const cookie = await makeUser("ssrf-create@example.com");
			const res = await api(
				"/jobs",
				{ method: "POST", body: JSON.stringify({ name: "meta", schedule: "*/5 * * * *", target_url: "http://169.254.169.254/latest" }) },
				cookie,
			);
			expect(res.status).toBe(400);
		} finally {
			process.env.EZCHRONO_ALLOW_PRIVATE_TARGETS = "1";
		}
	});

	test("GET jobs cannot carry a body", async () => {
		const cookie = await makeUser("getbody@example.com");
		const res = await api(
			"/jobs",
			{ method: "POST", body: JSON.stringify({ name: "x", schedule: "*/5 * * * *", target_url: target(), body: "{}" }) },
			cookie,
		);
		expect(res.status).toBe(400);
	});

	test("manual run records a run and updates the job", async () => {
		const cookie = await makeUser("manual@example.com");
		const { json } = await api(
			"/jobs",
			{ method: "POST", body: JSON.stringify({ name: "m", schedule: "*/5 * * * *", target_url: target() }) },
			cookie,
		);
		const run = await api(`/jobs/${json.id}/run`, { method: "POST" }, cookie);
		expect(run.json.status).toBe("ok");
		expect(run.json.http_status).toBe(200);
		const runs = await api(`/jobs/${json.id}/runs`, {}, cookie);
		expect(runs.json.runs[0].trigger).toBe("manual");
	});

	test("usage reports jobs and 24h runs against quota", async () => {
		const cookie = await makeUser("usage@example.com", { max_jobs: 3, max_runs_per_day: 50 });
		const usage = await api("/jobs/usage", {}, cookie);
		expect(usage.json.jobs.limit).toBe(3);
		expect(usage.json.runs24h.limit).toBe(50);
	});
});

describe("runner", () => {
	let ownerId = "";
	beforeAll(async () => {
		await makeUser("runner-owner@example.com");
		ownerId = (db.query("SELECT id FROM users WHERE email = ?").get("runner-owner@example.com") as { id: string }).id;
	});

	function jobRow(overrides: Partial<JobRow> = {}): JobRow {
		const id = crypto.randomUUID();
		const row = {
			id,
			user_id: ownerId,
			name: "t",
			schedule: "*/5 * * * *",
			target_url: target(),
			method: "GET" as const,
			body: null,
			timeout_ms: 1000,
			enabled: 1,
			next_run_at: null,
			...overrides,
		};
		db.run(
			`INSERT INTO jobs (id, user_id, name, schedule, target_url, method, body, timeout_ms, enabled, next_run_at, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
			[row.id, row.user_id, row.name, row.schedule, row.target_url, row.method, row.body, row.timeout_ms, row.enabled, row.next_run_at],
		);
		return row;
	}

	test("2xx is ok, 5xx is failed", async () => {
		const ok = await performRun(db, jobRow({ target_url: target("/ok") }), "manual");
		expect(ok.status).toBe("ok");
		const bad = await performRun(db, jobRow({ target_url: target("/boom") }), "manual");
		expect(bad.status).toBe("failed");
		expect(bad.http_status).toBe(500);
	});

	test("a slow target times out", async () => {
		const r = await performRun(db, jobRow({ target_url: target("/slow"), timeout_ms: 1000 }), "manual");
		expect(r.status).toBe("timeout");
	});

	test("redirects are not followed", async () => {
		const r = await performRun(db, jobRow({ target_url: target("/redirect") }), "manual");
		expect(r.status).toBe("failed");
		expect(r.error).toMatch(/Redirects/);
	});

	test("tick claims due jobs once and advances next_run_at", async () => {
		const job = jobRow({ target_url: target("/count"), next_run_at: 1 });
		const before = hitCount("/count");
		const now = Date.parse("2026-06-01T00:00:00Z");
		await tick(db, "UTC", now);
		await tick(db, "UTC", now); // same instant: must not fire twice
		const after = db.query("SELECT next_run_at FROM jobs WHERE id = ?").get(job.id) as { next_run_at: number };
		expect(after.next_run_at).toBeGreaterThan(now);
		expect(hitCount("/count") - before).toBe(1);
	});

	test("the daily quota skips the run and records why", async () => {
		db.run("UPDATE users SET max_runs_per_day = 0 WHERE id = ?", [ownerId]);
		const job = jobRow({ target_url: target("/quota-check"), next_run_at: 1 });
		await tick(db, "UTC", Date.now());
		const row = db.query("SELECT status, error FROM runs WHERE job_id = ? ORDER BY started_at DESC LIMIT 1").get(job.id) as { status: string; error: string };
		expect(row.status).toBe("quota");
		expect(hitCount("/quota-check")).toBe(0);
		db.run("UPDATE users SET max_runs_per_day = 288 WHERE id = ?", [ownerId]);
	});

	test("admin overview is admin-only", async () => {
		const user = await makeUser("plain@example.com");
		expect((await api("/admin/overview", {}, user)).status).toBe(403);
		const adminEmail = makeAdmin("admin-root@example.com");
		const adminCookie = await makeUser(adminEmail);
		makeAdmin(adminEmail);
		const ok = await api("/admin/overview", {}, adminCookie);
		expect(ok.status).toBe(200);
		expect(typeof ok.json.users).toBe("number");
	});

	test("admin cannot demote or disable themselves", async () => {
		const email = "self-admin@example.com";
		const cookie = await makeUser(email);
		makeAdmin(email);
		const me = db.query("SELECT id FROM users WHERE email = ?").get(email) as { id: string };
		const res = await api(`/admin/users/${me.id}`, { method: "PATCH", body: JSON.stringify({ role: "user" }) }, cookie);
		expect(res.status).toBe(400);
	});

	test("admin can change a user's quota", async () => {
		const adminCookie = await makeUser("quota-admin@example.com");
		makeAdmin("quota-admin@example.com");
		await makeUser("quota-target@example.com");
		const target = db.query("SELECT id FROM users WHERE email = ?").get("quota-target@example.com") as { id: string };
		const res = await api(`/admin/users/${target.id}`, { method: "PATCH", body: JSON.stringify({ max_jobs: 42 }) }, adminCookie);
		expect(res.status).toBe(200);
		const list = await api("/admin/users", {}, adminCookie);
		expect(list.json.users.find((u: { id: string }) => u.id === target.id).max_jobs).toBe(42);
	});
});
