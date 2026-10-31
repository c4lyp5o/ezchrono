import path from "node:path";
import { Elysia, file } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { VERSION, CLIENT_DIR } from "./config";
import { ApiError, type Deps } from "./http";
import { authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { adminRoutes } from "./routes/admin";

export function createApp(deps: Deps) {
	return new Elysia()
		.onError(({ code, error, set }) => {
			if (error instanceof ApiError) {
				set.status = error.status;
				return { error: error.message };
			}
			if (code === "VALIDATION") {
				set.status = 400;
				return { error: "Invalid request" };
			}
			if (code === "NOT_FOUND") {
				set.status = 404;
				return { error: "Not found" };
			}
			set.status = 500;
			console.error("[ezchrono] unhandled error:", error);
			return { error: "Internal server error" };
		})
		.use(openapi({ documentation: { info: { title: "ezchrono API", version: VERSION } } }))
		.get("/api/v1/health", () => ({ ok: true, version: VERSION }))
		.group("/api/v1", (api) =>
			api
				.use(authRoutes(deps))
				.use(jobRoutes(deps))
				.use(adminRoutes(deps)),
		)
		// Built client. Unknown API paths get a JSON 404; anything else falls back
		// to index.html so deep links survive a refresh.
		.get("/*", ({ request, set }) => {
			const { pathname } = new URL(request.url);
			if (pathname.startsWith("/api/")) {
				set.status = 404;
				return { error: "Not found" };
			}
			const rel = path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
			const candidate = path.join(CLIENT_DIR, rel);
			if (rel && candidate.startsWith(CLIENT_DIR + path.sep)) {
				const asset = Bun.file(candidate);
				if (asset.size > 0) return file(candidate);
			}
			return file(path.join(CLIENT_DIR, "index.html"));
		});
}
