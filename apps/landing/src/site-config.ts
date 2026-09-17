import { env } from "@SchedulesManager/env/landing";

/**
 * Landing-site legal configuration.
 *
 * Identity, contacts, and document version come from environment variables so
 * a deployment can set them without a code change (see .env.example). Unset
 * identity fields are blank rather than placeholders: the wording that would
 * name the entity, its address, or the governing law is omitted instead of
 * being filled with something that reads like a company. Fill them in before
 * the public launch.
 */
export const LEGAL_ENTITY = {
	legalName: env.VITE_LEGAL_NAME,
	address: env.VITE_LEGAL_ADDRESS,
	jurisdiction: env.VITE_LEGAL_JURISDICTION,
	registrationNumber: env.VITE_LEGAL_REGISTRATION_NUMBER,
	governingLaw: env.VITE_LEGAL_GOVERNING_LAW,
	venue: env.VITE_LEGAL_VENUE,
	contactEmail: env.VITE_LEGAL_CONTACT_EMAIL,
	privacyEmail: env.VITE_LEGAL_PRIVACY_EMAIL,
	supportEmail: env.VITE_LEGAL_SUPPORT_EMAIL,
} as const;

/** A configured value counts as set only when it has non-whitespace content. */
export function isSet(value: string): boolean {
	return value.trim().length > 0;
}

/**
 * The entity name to print. Falls back to the product name so sentences that
 * mention who is speaking stay grammatical when no entity is configured.
 */
export const LEGAL_NAME = isSet(LEGAL_ENTITY.legalName)
	? LEGAL_ENTITY.legalName
	: "jooling";

/**
 * The defined-terms parenthetical for the start of a document. "jooling" is
 * only listed as a defined term when the name itself is not already "jooling".
 */
export const ENTITY_DEFINITION = isSet(LEGAL_ENTITY.legalName)
	? `("jooling", "we", "us", or "our")`
	: `("we", "us", or "our")`;

/**
 * ", registered at <address> (<number>)" for sentences that name the entity,
 * or an empty string when neither is configured. Registration number is only
 * printed alongside an address, where it reads as part of the same clause.
 */
export function registrationSuffix(): string {
	const details = [
		isSet(LEGAL_ENTITY.address) ? LEGAL_ENTITY.address : "",
		isSet(LEGAL_ENTITY.registrationNumber)
			? `(${LEGAL_ENTITY.registrationNumber})`
			: "",
	].filter((part) => part.length > 0);
	return details.length > 0 ? `, registered at ${details.join(" ")}` : "";
}

/** Joins the parts of an entity line that are set, e.g. "Acme Inc. · Reg. 123". */
export function entityLine(parts: (string | false)[]): string {
	return parts
		.map((part) => (typeof part === "string" ? part.trim() : ""))
		.filter((part) => part.length > 0)
		.join(" · ");
}

/** Ends a sentence on the text without doubling a period it already has. */
export function withPeriod(text: string): string {
	const trimmed = text.trim();
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Version stamped into consent records. Keep identical to TERMS_VERSION in
 * the server and web apps so an acceptance can be matched to the published
 * document.
 */
export const TERMS_VERSION = env.VITE_TERMS_VERSION;

/** Rendered from an ISO date, in UTC so the printed day never shifts. */
export const LAST_UPDATED = new Intl.DateTimeFormat("en-US", {
	dateStyle: "long",
	timeZone: "UTC",
}).format(new Date(env.VITE_TERMS_UPDATED_AT));

/**
 * Third parties that process personal data on our behalf. Kept in source
 * rather than configuration: this list is published as part of the privacy
 * commitment, so it should change only with review, not with a deploy.
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

/**
 * Retention commitments. Kept in source because they must match what the
 * systems actually do; change them alongside the code that enforces them.
 */
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
