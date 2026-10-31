import crypto from "node:crypto";

export const SESSION_COOKIE = "ezchrono_session";

// A minimal signed token (HMAC-SHA256 over base64url JSON). It keeps the
// dependency list short and makes the verification path easy to test.

export function signToken(
	sub: string,
	secret: string,
	ttlSeconds: number,
	now: number = Date.now(),
): string {
	const body = Buffer.from(
		JSON.stringify({ sub, exp: Math.floor(now / 1000) + ttlSeconds }),
	).toString("base64url");
	const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
	return `${body}.${sig}`;
}

export function verifyToken(
	token: string,
	secret: string,
	now: number = Date.now(),
): string | null {
	const dot = token.indexOf(".");
	if (dot <= 0) return null;
	const body = token.slice(0, dot);
	const given = Buffer.from(token.slice(dot + 1));
	const expected = Buffer.from(
		crypto.createHmac("sha256", secret).update(body).digest("base64url"),
	);
	if (given.length !== expected.length) return null;
	if (!crypto.timingSafeEqual(given, expected)) return null;

	let payload: { sub?: unknown; exp?: unknown };
	try {
		payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
	} catch {
		return null;
	}
	if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
	if (payload.exp * 1000 <= now) return null;
	return payload.sub;
}
