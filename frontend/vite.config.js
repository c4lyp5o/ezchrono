import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/

// Footer: the running version and the source link, baked in at build time.
const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const APP_DEFINE = {
	__APP_VERSION__: JSON.stringify(pkg.version),
	__APP_REPO__: JSON.stringify("https://github.com/c4lyp5o/ezchrono"),
};

export default defineConfig({
	define: APP_DEFINE,
	server: {
		port: 3100,
		proxy: {
			"/api": {
				target: process.env.EZCHRONO_API || "http://localhost:5100",
				changeOrigin: true,
			},
		},
	},
	plugins: [
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler"]],
			},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "../client",
		emptyOutDir: true,
	},
});
