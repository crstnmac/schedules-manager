type OAuthConsentResult = {
	redirect_uri?: unknown;
	url?: unknown;
};

/**
 * Better Auth's typed client exposes `redirect_uri`, while the raw HTTP
 * endpoint returns its generic redirect envelope as `url`. Accept both so the
 * consent page remains compatible across provider versions, but never send the
 * browser to an absent, relative, or executable callback. Native OAuth clients
 * may legitimately use a registered custom URL scheme.
 */
export function oauthConsentRedirect(result: OAuthConsentResult): string {
	const candidate =
		typeof result.redirect_uri === "string"
			? result.redirect_uri
			: typeof result.url === "string"
				? result.url
				: null;
	if (!candidate)
		throw new Error("The authorization response had no callback URL");

	let callback: URL;
	try {
		callback = new URL(candidate);
	} catch {
		throw new Error("The authorization response had an invalid callback URL");
	}
	if (["javascript:", "data:", "vbscript:"].includes(callback.protocol)) {
		throw new Error("The authorization response had an invalid callback URL");
	}
	return callback.toString();
}
