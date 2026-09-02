import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(import.meta.dir, "../src");

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith(".ts") ? [path] : [];
	});
}

describe("published Schedule Version immutability", () => {
	test("server commands never update or delete published Shift snapshots", () => {
		for (const path of sourceFiles(sourceRoot)) {
			const source = readFileSync(path, "utf8");
			expect(source).not.toMatch(/\.update\(versionShifts\)/);
			expect(source).not.toMatch(/\.delete\(versionShifts\)/);
		}
	});
});
