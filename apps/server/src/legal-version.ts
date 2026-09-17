import { env } from "@SchedulesManager/env/server";

/**
 * Version stamped into each acceptance record, so a stored consent can be
 * matched to the exact Terms that were published.
 *
 * Set TERMS_VERSION in the server environment and keep it identical to
 * VITE_TERMS_VERSION in the landing and web apps; both default to the same
 * revision, and all three must move together when the Terms change.
 */
export const TERMS_VERSION = env.TERMS_VERSION;
