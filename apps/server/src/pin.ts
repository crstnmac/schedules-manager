import {
	createHash,
	randomBytes,
	type ScryptOptions,
	scrypt as scryptCb,
	timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
	password: string,
	salt: string,
	keylen: number,
	options: ScryptOptions,
) => Promise<Buffer>;

// Legacy PINs were stored as sha256("jooling-pin:" + pin) with no salt. That
// format is still verified (see pinMatches) so existing rows keep working;
// they are re-hashed with the salted format the next time the PIN is set.
const LEGACY_PREFIX = "jooling-pin:";

// N=2048, r=8 keeps a single verify fast enough for the kiosk verify loop
// (a few ms) while making an offline dictionary over the 4-8 digit keyspace
// memory-hard. The per-row salt prevents sharing work across rows.
const SCRYPT_PARAMS = { N: 2048, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function legacyHash(pin: string): string {
	return createHash("sha256").update(`${LEGACY_PREFIX}${pin}`).digest("hex");
}

/** Returns a salted scrypt digest ("scrypt$<salt-hex>$<hash-hex>"). */
export async function hashPin(pin: string): Promise<string> {
	const salt = randomBytes(16).toString("hex");
	const derived = (await scrypt(pin, salt, 32, SCRYPT_PARAMS)) as Buffer;
	return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function pinMatches(
	pin: string,
	hash: string | null,
): Promise<boolean> {
	if (!hash) return false;
	if (hash.startsWith("scrypt$")) {
		const [, salt, expected] = hash.split("$");
		if (!salt || !expected) return false;
		const actual = (await scrypt(pin, salt, 32, SCRYPT_PARAMS)) as Buffer;
		const expectedBuf = Buffer.from(expected, "hex");
		if (actual.length !== expectedBuf.length) return false;
		return timingSafeEqual(actual, expectedBuf);
	}
	const actual = legacyHash(pin);
	if (actual.length !== hash.length) return false;
	return timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

export function assertPin(pin: string) {
	if (!/^\d{4,8}$/.test(pin)) {
		throw new Error("PIN must be 4 to 8 digits");
	}
}
