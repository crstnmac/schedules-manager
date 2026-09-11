import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { api } from "./api";
import { useCurrentEmployment } from "./queries";

const registered = new Set<string>();

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
	}),
});

export async function requestPushPermissionAndToken(): Promise<{
	token: string;
	platform: "ios" | "android";
} | null> {
	if (Platform.OS === "web") return null;

	const settings = await Notifications.getPermissionsAsync();
	let granted =
		settings.granted ||
		settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
	if (!granted) {
		const request = await Notifications.requestPermissionsAsync();
		granted =
			request.granted ||
			request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
	}
	if (!granted) return null;

	if (Platform.OS === "android") {
		await Notifications.setNotificationChannelAsync("default", {
			name: "Schedule updates",
			importance: Notifications.AndroidImportance.DEFAULT,
			vibrationPattern: [0, 250, 250, 250],
			lightColor: "#C2413A",
		});
	}

	const projectId = Constants.expoConfig?.extra?.eas?.projectId as
		| string
		| undefined;
	const tokenResponse = await Notifications.getExpoPushTokenAsync({
		projectId,
	});

	return {
		token: tokenResponse.data,
		platform: Platform.OS === "ios" ? "ios" : "android",
	};
}

export function usePushRegistration() {
	const { workplaceId } = useCurrentEmployment();
	const registering = useRef(false);

	useEffect(() => {
		if (!workplaceId || registering.current) return;
		registering.current = true;

		void (async () => {
			try {
				const result = await requestPushPermissionAndToken();
				if (!result) {
					console.warn("[push] Skipped registration: no permission or token");
					return;
				}
				const key = `${workplaceId}:${result.token}`;
				if (registered.has(key)) return;
				await api(`/v1/workplaces/${workplaceId}/my/push-token`, {
					method: "POST",
					body: result,
				});
				registered.add(key);
				console.warn(`[push] Registered token for workplace ${workplaceId}`);
			} catch (error) {
				console.warn(
					`[push] Registration failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				registering.current = false;
			}
		})();
	}, [workplaceId]);
}

export function usePushResponseNavigation() {
	const queryClient = useQueryClient();
	const { isManager } = useCurrentEmployment();

	useEffect(() => {
		if (Platform.OS === "web") return;

		const subscription = Notifications.addNotificationResponseReceivedListener(
			(response) => {
				const data = response.notification.request.content.data as {
					kind?: string;
				};
				queryClient.invalidateQueries({ queryKey: ["notifications"] });
				// Shift-start reminders have a dedicated handler that lands on the
				// schedule and refreshes the punch state; don't double-navigate.
				if (data.kind === "shift_start") return;
				router.push(destinationForNotification(data.kind, isManager));
			},
		);

		return () => subscription.remove();
	}, [queryClient, isManager]);
}

export type PushDestination =
	| "/(tabs)"
	| "/(tabs)/inbox"
	| "/(tabs)/openshifts"
	| "/(tabs)/manager-requests"
	| "/(tabs)/manager-schedule"
	| "/worker-availability"
	| "/announcements"
	| "/messages";

/**
 * Mirrors the web inbox kind→destination mapping, adapted to the native tab
 * graph. Manager-facing operational alerts (releases, pickups, time off,
 * swaps) land in the Requests queue; worker alerts land on the Schedule,
 * Open Shifts, or Time-off surface.
 */
export function destinationForNotification(
	kind: string | undefined,
	isManager: boolean,
): PushDestination {
	if (!kind) return "/(tabs)/inbox";

	if (isManager) {
		if (kind === "acceptance_response") {
			return "/(tabs)/manager-schedule";
		}
		if (
			kind === "release_requested" ||
			kind === "pickup_requested" ||
			kind.startsWith("time_off") ||
			kind.startsWith("unavailability") ||
			kind.startsWith("swap")
		) {
			return "/(tabs)/manager-requests";
		}
	}

	if (kind === "open_shift" || kind.startsWith("pickup")) {
		return "/(tabs)/openshifts";
	}
	if (kind.startsWith("time_off") || kind.startsWith("unavailability")) {
		return "/worker-availability";
	}
	if (kind.includes("announcement")) return "/announcements";
	if (kind.includes("message")) return "/messages";
	// schedule_published, late_change, schedule_reminder, acceptance_response,
	// release_*, swap_*, coverage_filled all surface on the worker schedule.
	return "/(tabs)";
}
