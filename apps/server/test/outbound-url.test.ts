import { describe, expect, test } from "bun:test";

import { assertPublicHttpsUrl, isPrivateAddress } from "../src/outbound-url";

describe("isPrivateAddress", () => {
	test("flags loopback, private, link-local, metadata and reserved ranges", () => {
		for (const address of [
			"127.0.0.1",
			"10.1.2.3",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"0.0.0.0",
			"224.0.0.1",
			"::1",
			"::",
			"fd00::1",
			"fe80::1",
			"::ffff:127.0.0.1",
			"::ffff:7f00:1",
			"::ffff:a9fe:a9fe",
			"::127.0.0.1",
			"64:ff9b::a00:1",
			"64:ff9b:1::1",
			"2002:7f00:1::",
			"fec0::1",
			"not-an-ip",
		]) {
			expect(isPrivateAddress(address)).toBe(true);
		}
	});

	test("allows public addresses", () => {
		for (const address of [
			"8.8.8.8",
			"172.32.0.1",
			"100.128.0.1",
			"2606:4700::1111",
			"::ffff:808:808",
			"64:ff9b::808:808",
		]) {
			expect(isPrivateAddress(address)).toBe(false);
		}
	});
});

describe("assertPublicHttpsUrl", () => {
	test("refuses http, embedded credentials and private literals", async () => {
		await expect(assertPublicHttpsUrl("http://8.8.8.8/hook")).rejects.toThrow(
			"https",
		);
		await expect(
			assertPublicHttpsUrl("https://user:pass@8.8.8.8/hook"),
		).rejects.toThrow("credentials");
		await expect(
			assertPublicHttpsUrl("https://169.254.169.254/latest"),
		).rejects.toThrow("public address");
		await expect(assertPublicHttpsUrl("https://[::1]/hook")).rejects.toThrow(
			"public address",
		);
		// WHATWG URL rewrites this to ::ffff:7f00:1 before the check sees it.
		await expect(
			assertPublicHttpsUrl("https://[::ffff:127.0.0.1]/hook"),
		).rejects.toThrow("public address");
	});

	test("accepts a public https literal", async () => {
		const url = await assertPublicHttpsUrl("https://8.8.8.8/hook");
		expect(url.hostname).toBe("8.8.8.8");
	});
});
