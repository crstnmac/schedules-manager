import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const posthogUiHost =
		env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com";
	const posthogHost = posthogUiHost.replace(
		"eu.posthog.com",
		"eu.i.posthog.com",
	);
	const posthogAssetsHost = posthogUiHost.replace(
		"eu.posthog.com",
		"eu-assets.i.posthog.com",
	);

	return {
		server: {
			port: 3001,
			strictPort: true,
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
		build: {
			rollupOptions: {
				output: {
					// Heavy, rarely-changing vendor libs get their own long-cached
					// chunks. Charts and maps are intentionally left to the
					// router's per-route splitting: forcing them into a named chunk
					// pulls shared helpers in and makes the entry preload them.
					manualChunks(id: string) {
						if (!id.includes("node_modules")) return undefined;
						if (/[\\/]node_modules[\\/]read-excel-file[\\/]/.test(id))
							return "vendor-spreadsheet";
						if (/[\\/]node_modules[\\/]posthog-js[\\/]/.test(id))
							return "vendor-posthog";
						return undefined;
					},
				},
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
