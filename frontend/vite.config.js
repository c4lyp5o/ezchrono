import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
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
