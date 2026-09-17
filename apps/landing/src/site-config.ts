/**
 * Single source of truth for the legal identity of the business.
 *
 * ⚠️ REPLACE THE PLACEHOLDER VALUES BEFORE LAUNCH. Every legal page (Terms,
 * Privacy Policy, DPA) and the site footer read from this file, so a change
 * here updates the whole site. The values must match the actual corporate
 * registration: governing law and venue should be the jurisdiction the entity
 * is incorporated in.
 */
export const LEGAL_ENTITY = {
	displayName: "jooling",
	/** Exact registered legal name, e.g. "jooling, Inc." or "jooling Ltd". */
	legalName: "[REGISTERED LEGAL NAME]",
	/** Registered business address, e.g. "1 Example St, Wilmington, DE 19801, USA". */
	address: "[REGISTERED BUSINESS ADDRESS]",
	/** Jurisdiction of incorporation, e.g. "Delaware, USA". */
	jurisdiction: "[JURISDICTION OF INCORPORATION]",
	/** Company/registrar identifier, e.g. Delaware file number or Companies House number. */
	registrationNumber: "[REGISTRATION NUMBER]",
	/** Governing law for the Terms, e.g. "the laws of the State of Delaware, USA". */
	governingLaw: "[e.g. the laws of the State of Delaware, USA]",
	/** Exclusive venue for disputes, e.g. "the state and federal courts located in Delaware, USA". */
	venue:
		"[e.g. the state and federal courts located in New Castle County, Delaware, USA]",
	contactEmail: "legal@jooling.com",
	privacyEmail: "privacy@jooling.com",
	supportEmail: "support@jooling.com",
} as const;

/** Version stamped into consent records at signup and checkout (CA ARL keeps these 3 years). */
export const TERMS_VERSION = "2026-09-17";

export const LAST_UPDATED = "September 17, 2026";

/**
 * Third parties that process personal data on our behalf. Keep this in sync
 * with the subprocessors actually configured in production (payments, product
 * analytics, transactional email, push delivery, hosting).
 */
export const SUBPROCESSORS = [
	{
		name: "Polar",
		purpose: "Payments, billing, and the customer billing portal",
		location: "United States",
	},
	{
		name: "PostHog (EU cloud)",
		purpose: "Product analytics",
		location: "European Union",
	},
	{
		name: "ZeptoMail",
		purpose: "Transactional email (team invitations, password resets)",
		location: "India / European Union",
	},
	{
		name: "Expo",
		purpose: "Push notification delivery",
		location: "United States",
	},
	{
		name: "Our cloud hosting provider",
		purpose: "Application and database hosting",
		location: "See our hosting region configuration",
	},
] as const;

/** Concrete retention commitments (Privacy Policy §5). Adjust only after ops agrees. */
export const RETENTION = {
	/** Workplace records deleted or anonymized this long after closure. */
	workplaceDataDays: 90,
	/** Personal data deleted this long after account closure. */
	accountDataDays: 90,
	/** Billing and tax records. */
	billingYears: 7,
	/** Consent records kept to prove acceptance of the Terms (min. 3 years). */
	consentYears: 3,
	/** Application/device logs. */
	logDays: 90,
} as const;
