import posthog from "posthog-js";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;

/**
 * PostHog only initializes after the visitor accepts analytics cookies in the
 * consent banner (see cookie-consent.tsx). Until then nothing is written — no
 * cookies, no localStorage, no network calls.
 */
let initialized = false;

export function initAnalytics() {
	if (initialized || !token) return;
	initialized = true;
	posthog.init(token, {
		api_host:
			import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
		capture_pageview: true,
		capture_pageleave: true,
		disable_session_recording: true,
		person_profiles: "identified_only",
	});
}

export function captureComparisonVisit(slug: string) {
	if (!initialized) return;
	posthog.capture("comparison_page_viewed", {
		competitor: slug,
		path: `/vs/${slug}`,
	});
}

export function captureComparisonSignup(slug: string) {
	if (!initialized) return;
	posthog.capture("comparison_signup_clicked", { competitor: slug });
}
