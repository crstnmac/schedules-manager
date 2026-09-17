import { env } from "@SchedulesManager/env/landing";

/**
 * Landing-site legal configuration.
 *
 * Identity, contacts, and document version come from environment variables so
 * a deployment can set them without a code change (see .env.example). Set the
 * VITE_LEGAL_* values before launch: the placeholders below are printed on the
 * Terms, Privacy Policy, DPA, and every footer.
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
