import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { assertPin, hashPin, pinMatches } from "../src/pin";

describe("pin", () => {
	test("hashPin produces a salted scrypt digest that verifies", async () => {
		const hash = await hashPin("1234");
		expect(hash.startsWith("scrypt$")).toBe(true);
		expect(await pinMatches("1234", hash)).toBe(true);
		expect(await pinMatches("1235", hash)).toBe(false);
	});

	test("two hashes of the same PIN differ (per-row salt)", async () => {
		expect(await hashPin("1234")).not.toBe(await hashPin("1234"));
	});

	test("legacy unsalted sha256 hashes still verify", async () => {
		const legacy = createHash("sha256")
			.update("jooling-pin:0000")
			.digest("hex");
		expect(await pinMatches("0000", legacy)).toBe(true);
		expect(await pinMatches("0001", legacy)).toBe(false);
	});

	test("pinMatches rejects null and malformed hashes", async () => {
		expect(await pinMatches("1234", null)).toBe(false);
		expect(await pinMatches("1234", "scrypt$")).toBe(false);
		expect(await pinMatches("1234", "")).toBe(false);
	});

	test("assertPin enforces 4-8 digits", () => {
		expect(() => assertPin("123")).toThrow();
		expect(() => assertPin("123456789")).toThrow();
		expect(() => assertPin("12a4")).toThrow();
		expect(assertPin("1234")).toBeUndefined();
	});
});
