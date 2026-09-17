import { env } from "@SchedulesManager/env/web";

import { api } from "./api";

/**
 * Legal consent plumbing.
 *
 * Affirmative consent is captured in the UI (a required checkbox at sign-up
 * and a billing disclosure before checkout) and then recorded server-side so
 * we can prove it later — auto-renewal laws such as Cal. Bus. & Prof. Code
 * §17600 et seq. require keeping that proof for three years. Because a new
 * account may need email confirmation before it has a session, acceptances
 * are queued locally and flushed on the first authenticated request.
 */
export const TERMS_VERSION = "2026-09-17";

export type LegalAcceptanceKind = "terms" | "billing";

export const legalUrls = {
	terms: `${env.VITE_LANDING_URL}/terms`,
	privacy: `${env.VITE_LANDING_URL}/privacy`,
	dpa: `${env.VITE_LANDING_URL}/dpa`,
} as const;

const PENDING_KEY = "jooling_pending_legal_acceptances";

type PendingAcceptance = {
	kind: LegalAcceptanceKind;
	version: string;
	surface: string;
};

function readPending(): PendingAcceptance[] {
	try {
		const raw = window.localStorage.getItem(PENDING_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as PendingAcceptance[]) : [];
	} catch {
		return [];
	}
}

function writePending(entries: PendingAcceptance[]) {
	try {
		if (entries.length === 0) window.localStorage.removeItem(PENDING_KEY);
		else window.localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
	} catch {
		// Storage unavailable: the acceptance still happens in the UI.
	}
}

/** Queue consent captured in the UI; flushed once a session exists. */
export function queueLegalAcceptance(
	kind: LegalAcceptanceKind,
	surface: string,
) {
	const entries = readPending().filter((entry) => entry.kind !== kind);
	entries.push({ kind, version: TERMS_VERSION, surface });
	writePending(entries);
}

/** Send any queued acceptances to the server. Safe to call repeatedly. */
export async function flushPendingLegalAcceptances() {
	const pending = readPending();
	if (pending.length === 0) return;
	const remaining: PendingAcceptance[] = [];
	for (const entry of pending) {
		try {
			await api("/v1/legal/acceptances", {
				method: "POST",
				body: {
					kind: entry.kind,
					version: entry.version,
					surface: entry.surface,
				},
			});
		} catch {
			// Keep it queued: a later sign-in will retry.
			remaining.push(entry);
		}
	}
	writePending(remaining);
}
