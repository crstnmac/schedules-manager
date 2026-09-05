import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for component tests in apps/web.
 *
 * - Component test files use the `.vitest.tsx` extension so they are picked up
 *   ONLY by vitest's `include` glob here, and NOT by `bun test` (which only
 *   matches `*.test.*` / `*.spec.*`).
 * - `happy-dom` provides the DOM; polyfills for layout APIs that
 *   `MessageScroller`/shadcn primitives may touch are added in
 *   `vitest.setup.ts`.
 * - Aliases mirror `tsconfig.json` `paths` plus the explicit
 *   `@SchedulesManager/auth` alias from `vite.config.ts`. The TanStack Router
 *   plugin is intentionally NOT included so no `routeTree.gen.ts` regeneration
 *   runs during tests.
 */
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
			"@SchedulesManager/auth": fileURLToPath(
				new URL("../../packages/auth/src/index.ts", import.meta.url),
			),
			"@SchedulesManager/ui/components": fileURLToPath(
				new URL("../../packages/ui/src/components", import.meta.url),
			),
			"@SchedulesManager/ui/lib": fileURLToPath(
				new URL("../../packages/ui/src/lib", import.meta.url),
			),
			"@SchedulesManager/ui/hooks": fileURLToPath(
				new URL("../../packages/ui/src/hooks", import.meta.url),
			),
		},
	},
	test: {
		environment: "happy-dom",
		include: ["**/*.vitest.?(c|m)[jt]s?(x)"],
		setupFiles: ["./vitest.setup.ts"],
	},
});
