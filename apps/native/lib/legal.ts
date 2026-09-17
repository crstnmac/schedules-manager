import { api } from "./api";

/**
 * Legal consent for the mobile app. Mirrors apps/web/src/lib/legal.ts: the
 * checkbox is the affirmative consent, and the record is written to the
 * server so it can be produced later (auto-renewal laws require keeping proof
 * of consent for at least three years).
 */
export const TERMS_VERSION = "2026-09-17";

export const LEGAL_LINKS = [
	{ label: "Terms & Conditions", url: "https://jooling.com/terms" },
	{ label: "Privacy Policy", url: "https://jooling.com/privacy" },
	{ label: "Data Processing Addendum", url: "https://jooling.com/dpa" },
] as const;

export async function recordLegalAcceptance(
	kind: "terms" | "billing",
	surface: string,
) {
	await api("/v1/legal/acceptances", {
		method: "POST",
		body: { kind, version: TERMS_VERSION, surface },
	});
}
