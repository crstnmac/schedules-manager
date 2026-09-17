import { useEffect, useState } from "react";

import { initAnalytics } from "./analytics";
import { Link } from "./router";

const STORAGE_KEY = "jooling_cookie_consent";

export function readCookieConsent(): "granted" | "denied" | null {
	try {
		const value = window.localStorage.getItem(STORAGE_KEY);
		return value === "granted" || value === "denied" ? value : null;
	} catch {
		return null;
	}
}

function storeCookieConsent(value: "granted" | "denied") {
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		// Storage may be unavailable; the choice simply won't persist.
	}
	window.dispatchEvent(new CustomEvent("jooling:cookie-consent"));
}

/**
 * Non-essential analytics on the marketing site load only after the visitor
 * accepts. Strictly necessary cookies (sign-in sessions) never require
 * consent, so a decline still leaves the site fully usable.
 */
export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);

	useEffect(() => {
		if (readCookieConsent() === "granted") {
			initAnalytics();
			return;
		}
		if (readCookieConsent() === null) setShowBanner(true);
		const onConsentChange = () => {
			if (readCookieConsent() === "granted") initAnalytics();
		};
		window.addEventListener("jooling:cookie-consent", onConsentChange);
		return () =>
			window.removeEventListener("jooling:cookie-consent", onConsentChange);
	}, []);

	if (!showBanner) return null;

	return (
		<div className="cookie-consent" role="dialog" aria-label="Cookie consent">
			<p>
				We use strictly necessary cookies to run the site, and optional
				analytics cookies to understand how it is used. Analytics only load if
				you accept. <Link to="/privacy#cookies">Read how we use cookies</Link>.
			</p>
			<div className="cookie-consent-actions">
				<button
					type="button"
					className="button button-secondary"
					onClick={() => {
						storeCookieConsent("denied");
						setShowBanner(false);
					}}
				>
					Decline
				</button>
				<button
					type="button"
					className="button button-primary"
					onClick={() => {
						storeCookieConsent("granted");
						setShowBanner(false);
					}}
				>
					Accept analytics
				</button>
			</div>
		</div>
	);
}
