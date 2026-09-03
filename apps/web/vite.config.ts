import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const posthogHost = env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
	// EU region assets host
	const posthogAssetsHost = posthogHost.replace("eu.i.posthog.com", "eu-assets.i.posthog.com");

	return {
	server: {
		port: 3001,
		proxy: {
			"/ingest/static": {
				target: posthogAssetsHost,
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/ingest/, ""),
			},
			"/ingest/array": {
				target: posthogAssetsHost,
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/ingest/, ""),
			},
			"/ingest": {
				target: posthogHost,
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/ingest/, ""),
			},
		},
	},
	resolve: {
		tsconfigPaths: true,
		// Prefer TypeScript sources over accidental sibling .js compile artifacts.
		extensions: [".mjs", ".mts", ".ts", ".tsx", ".jsx", ".js", ".json"],
		extensionAlias: {
			".js": [".ts", ".tsx", ".js"],
			".jsx": [".tsx", ".jsx"],
		},
		alias: {
			"@SchedulesManager/auth": fileURLToPath(
				new URL("../../packages/auth/src/index.ts", import.meta.url),
			),
		},
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
	],
	};
});
