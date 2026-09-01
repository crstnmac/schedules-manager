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

	useEffect(() => {
		if (Platform.OS === "web") return;

		const subscription = Notifications.addNotificationResponseReceivedListener(
			() => {
				queryClient.invalidateQueries({ queryKey: ["notifications"] });
				router.push("/(tabs)/inbox");
			},
		);

		return () => subscription.remove();
	}, [queryClient]);
}
