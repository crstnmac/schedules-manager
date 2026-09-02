import { createHash, timingSafeEqual } from "node:crypto";

export function hashPin(pin: string): string {
	return createHash("sha256").update(`jooling-pin:${pin}`).digest("hex");
}

export function pinMatches(pin: string, hash: string | null): boolean {
	if (!hash) return false;
	const actual = hashPin(pin);
	if (actual.length !== hash.length) return false;
	return timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

export function assertPin(pin: string) {
	if (!/^\d{4,8}$/.test(pin)) {
		throw new Error("PIN must be 4 to 8 digits");
	}
}
