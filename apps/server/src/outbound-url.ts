import { env } from "@SchedulesManager/env/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { BadRequestError } from "./errors";

function ipv4Private(address: string): boolean {
	const [a = 0, b = 0] = address.split(".").map(Number);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 192 && b === 0) ||
		(a === 198 && (b === 18 || b === 19))
	);
}

/** Expands an IPv6 literal into its eight 16-bit groups, or null. */
function ipv6Groups(address: string): number[] | null {
	let text = address.toLowerCase();
	const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
	if (dotted?.[1]) {
		const [a = 0, b = 0, c = 0, d = 0] = dotted[1].split(".").map(Number);
		text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const halves = text.split("::");
	if (halves.length > 2) return null;
	const head = halves[0] ? halves[0].split(":") : [];
	const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
	const missing = 8 - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
	const groups = [...head, ...Array(missing).fill("0"), ...tail].map((group) =>
		Number.parseInt(group, 16),
	);
	return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff)
		? groups
		: null;
}

function embeddedIpv4(high: number, low: number): string {
	return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * Loopback, private, link-local, carrier-grade NAT, multicast and reserved
 * ranges, including IPv4 hidden inside IPv6 (mapped, compatible, NAT64, 6to4).
 * Unparseable input counts as private so the guard fails closed.
 */
export function isPrivateAddress(address: string): boolean {
	if (isIP(address) === 4) return ipv4Private(address);
	const g = ipv6Groups(address);
	if (!g) return true;
	const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = g;
	const prefixZero = g.slice(0, 5).every((group) => group === 0);
	// ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible, also :: and ::1)
	if (prefixZero && (g5 === 0xffff || g5 === 0)) {
		return g5 === 0 && g6 === 0 && g7 <= 1
			? true
			: ipv4Private(embeddedIpv4(g6, g7));
	}
	// NAT64: 64:ff9b::/96 embeds IPv4; 64:ff9b:1::/48 is local-use
	if (g0 === 0x64 && g1 === 0xff9b) {
		return g[2] === 1 ? true : ipv4Private(embeddedIpv4(g6, g7));
	}
	// 6to4 2002::/16 embeds the IPv4 in groups 1-2
	if (g0 === 0x2002) return ipv4Private(embeddedIpv4(g1, g[2] ?? 0));
	return (
		(g0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
		(g0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
		(g0 & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
		(g0 & 0xff00) === 0xff00 || // ff00::/8 multicast
		(g0 === 0x2001 && g1 === 0x0db8) // documentation
	);
}

/**
 * SEC-004: outbound webhook targets must be https and resolve only to public
 * addresses, so a Workplace cannot point the server at its own network or the
 * cloud metadata service. Checked on save and again before every send.
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new BadRequestError("Webhook URL is not a valid URL");
	}
	if (env.WEBHOOK_ALLOW_PRIVATE_URLS) return url;
	if (url.protocol !== "https:") {
		throw new BadRequestError("Webhook URL must use https");
	}
	if (url.username || url.password) {
		throw new BadRequestError("Webhook URL must not contain credentials");
	}
	const host = url.hostname.replace(/^\[|\]$/g, "");
	let addresses: string[];
	if (isIP(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await lookup(host, { all: true })).map(
				(entry) => entry.address,
			);
		} catch {
			throw new BadRequestError("Webhook URL host could not be resolved");
		}
	}
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		throw new BadRequestError("Webhook URL must point to a public address");
	}
	return url;
}
