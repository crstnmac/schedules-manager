import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 3001,
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
});
