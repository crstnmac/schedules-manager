import { env } from "@SchedulesManager/env/native";
import Constants from "expo-constants";
import { NativeModules } from "react-native";

function lanHostFromMetro(): string | null {
	const sourceCode = NativeModules.SourceCode as
		| { scriptURL?: string }
		| undefined;
	const candidates = [
		Constants.expoConfig?.hostUri,
		Constants.linkingUri,
		Constants.experienceUrl,
		sourceCode?.scriptURL,
	];

	for (const candidate of candidates) {
		if (!candidate) continue;
		const match = candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
		if (match) return match[1];
	}

	return null;
}

function isLoopback(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "0.0.0.0" ||
		hostname === "[::1]"
	);
}

export function getServerUrl(): string {
	return resolveUrl(env.EXPO_PUBLIC_SERVER_URL);
}

/**
 * Origin of the web app, which owns billing settings, the customer portal, and
 * the legal pages. Mirrors getServerUrl so a phone on the LAN can reach a
 * locally running web app during development.
 */
export function getAppUrl(): string {
	return resolveUrl(env.EXPO_PUBLIC_APP_URL);
}

function resolveUrl(configured: string): string {
	const trimmed = configured.replace(/\/$/, "");
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return trimmed;
	}

	if (!isLoopback(url.hostname)) return url.origin;

	const host = lanHostFromMetro();
	if (!host) return url.origin;

	url.hostname = host;
	return url.origin;
}
