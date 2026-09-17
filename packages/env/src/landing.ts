import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Landing-site configuration. The legal identity below is printed on the
 * Terms, Privacy Policy, DPA, and every site footer. Unset values are blank
 * rather than placeholders: the affected wording is omitted instead of being
 * filled with something that looks like a company. Fill these in before the
 * public launch — a contract that names no counterparty and states no
 * governing law is materially worse than one that visibly says it is missing.
 */
export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_APP_URL: z.url().default("http://localhost:3001"),
		VITE_DOCS_URL: z.url().default("https://docs.jooling.com"),
		VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
		VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),

		/** Exact registered legal name, e.g. "jooling, Inc." or "jooling Ltd". */
		VITE_LEGAL_NAME: z.string().default(""),
		/** Registered business address. */
		VITE_LEGAL_ADDRESS: z.string().default(""),
		/** Jurisdiction of incorporation, e.g. "Delaware, USA". */
		VITE_LEGAL_JURISDICTION: z.string().default(""),
		/** Registrar identifier, e.g. a Delaware file number. */
		VITE_LEGAL_REGISTRATION_NUMBER: z.string().default(""),
		/** Governing law for the Terms, e.g. "the laws of the State of Delaware, USA". */
		VITE_LEGAL_GOVERNING_LAW: z.string().default(""),
		/** Exclusive venue for disputes. */
		VITE_LEGAL_VENUE: z.string().default(""),
		VITE_LEGAL_CONTACT_EMAIL: z.email().default("legal@jooling.com"),
		VITE_LEGAL_PRIVACY_EMAIL: z.email().default("privacy@jooling.com"),
		VITE_LEGAL_SUPPORT_EMAIL: z.email().default("support@jooling.com"),

		/** Stamped into consent records; keep identical across the apps. */
		VITE_TERMS_VERSION: z.string().min(1).default("2026-09-17"),
		/** ISO date the legal documents were last revised, rendered as written. */
		VITE_TERMS_UPDATED_AT: z.iso.date().default("2026-09-17"),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
