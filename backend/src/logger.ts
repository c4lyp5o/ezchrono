type Level = "info" | "warn" | "error";

// Plain JSON lines on stdout/stderr: easy for journald and docker logs to parse.
function emit(level: Level, msg: string, extra?: unknown): void {
	const line = JSON.stringify({
		ts: new Date().toISOString(),
		level,
		msg,
		...(extra === undefined ? {} : { detail: String(extra) }),
	});
	(level === "info" ? console.log : console.error)(line);
}

export const logger = {
	info: (msg: string, extra?: unknown) => emit("info", msg, extra),
	warn: (msg: string, extra?: unknown) => emit("warn", msg, extra),
	error: (msg: string, extra?: unknown) => emit("error", msg, extra),
};
