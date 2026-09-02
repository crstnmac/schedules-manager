import { afterEach, expect, test } from "bun:test";
import { expoError, getExpoReceipts, sendExpoPush } from "../src/push";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function mockResponse(body: unknown, status = 200) {
	globalThis.fetch = (async () =>
		Response.json(body, { status })) as typeof fetch;
}
test("Expo error details and accepted tickets are preserved", async () => {
	mockResponse({
		data: [
			{ status: "ok", id: "receipt-1" },
			{ status: "error", details: { error: "DeviceNotRegistered" } },
			{ status: "error", details: { error: "MessageRateExceeded" } },
		],
	});
	expect(await sendExpoPush([{ to: "a" }, { to: "b" }, { to: "c" }])).toEqual({
		tickets: [{ token: "a", id: "receipt-1" }],
		invalidTokens: ["b"],
		errors: ["MessageRateExceeded"],
	});
});
test("missing tickets never count as successful delivery", async () => {
	mockResponse({ data: [] });
	await expect(sendExpoPush([{ to: "a" }])).rejects.toThrow("ticket count");
});
test("receipt lookup preserves provider errors and rejects malformed responses", async () => {
	mockResponse({
		data: {
			ticket: { status: "error", details: { error: "DeviceNotRegistered" } },
		},
	});
	const receipts = await getExpoReceipts(["ticket"]);
	const receipt = receipts.ticket;
	if (!receipt) throw new Error("Missing receipt");
	expect(expoError(receipt)).toBe("DeviceNotRegistered");
	mockResponse({ errors: [{ message: "unavailable" }] });
	await expect(getExpoReceipts(["ticket"])).rejects.toThrow();
});
test("HTTP failure is retriable rather than reported as success", async () => {
	mockResponse({}, 503);
	await expect(sendExpoPush([{ to: "a" }])).rejects.toThrow("503");
});
