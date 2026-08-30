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
	const configured = env.EXPO_PUBLIC_SERVER_URL.replace(/\/$/, "");
	let url: URL;
	try {
		url = new URL(configured);
	} catch {
		return configured;
	}

	if (!isLoopback(url.hostname)) return url.origin;

	const host = lanHostFromMetro();
	if (!host) return url.origin;

	url.hostname = host;
	return url.origin;
}
