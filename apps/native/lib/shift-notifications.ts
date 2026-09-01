import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import type { MyScheduleResponse } from "./queries";

const CATEGORY = "SHIFT_START";
const ACTION_START = "START_SHIFT";
const REMINDER_LEAD_MS = 15 * 60 * 1000;
const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

let categoryReady = false;
let scheduledIds: string[] = [];
let lastSyncKey: string | null = null;

async function ensureCategory() {
	if (categoryReady || Platform.OS === "web") return;
	await Notifications.setNotificationCategoryAsync(CATEGORY, [
		{
			identifier: ACTION_START,
			buttonTitle: "Start shift",
			options: { opensAppToForeground: true },
		},
	]);
	categoryReady = true;
}

function upcomingShifts(schedule: MyScheduleResponse | undefined) {
	const now = Date.now();
	const weeks = [schedule?.currentWeek, schedule?.nextWeek];
	const shifts = weeks
		.flatMap((week) => week?.shifts ?? [])
		.filter(
			(shift) =>
				!shift.timeEntry &&
				now < new Date(shift.endsAt).getTime() &&
				new Date(shift.startsAt).getTime() - REMINDER_LEAD_MS > now &&
				new Date(shift.startsAt).getTime() < now + HORIZON_MS,
		);
	return shifts;
}

export function useShiftStartNotifications(
	workplaceId: string | undefined,
	schedule: MyScheduleResponse | undefined,
) {
	const syncing = useRef(false);

	useEffect(() => {
		if (!workplaceId || !schedule || Platform.OS === "web") return;

		const shifts = upcomingShifts(schedule);
		const syncKey = shifts
			.map((shift) => `${shift.id}:${shift.startsAt}`)
			.sort()
			.join("|");
		if (syncing.current || syncKey === lastSyncKey) return;
		syncing.current = true;

		void (async () => {
			try {
				await ensureCategory();
				await Promise.all(
					scheduledIds.map((id) =>
						Notifications.cancelScheduledNotificationAsync(id).catch(
							() => undefined,
						),
					),
				);
				scheduledIds = [];

				for (const shift of shifts) {
					const fireDate = new Date(
						new Date(shift.startsAt).getTime() - REMINDER_LEAD_MS,
					);
					const id = await Notifications.scheduleNotificationAsync({
						content: {
							title: "Shift starting soon",
							body: `${shift.positionName} starts at ${new Date(
								shift.startsAt,
							).toLocaleTimeString([], {
								hour: "numeric",
								minute: "2-digit",
							})}. Ready to start?`,
							data: {
								kind: "shift_start",
								versionShiftId: shift.id,
							},
							categoryIdentifier: CATEGORY,
						},
						trigger: {
							type: Notifications.SchedulableTriggerInputTypes.DATE,
							date: fireDate,
						},
					});
					scheduledIds.push(id);
				}
				lastSyncKey = syncKey;
			} catch (error) {
				console.warn(
					`[shift-notifications] Sync failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				syncing.current = false;
			}
		})();
	}, [workplaceId, schedule]);
}

export function useShiftStartResponseHandler() {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (Platform.OS === "web") return;

		const subscription = Notifications.addNotificationResponseReceivedListener(
			(response) => {
				const data = response.notification.request.content.data as {
					kind?: string;
				};
				if (data.kind !== "shift_start") return;
				queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
				// HotSchedules-style: land on the schedule so the worker confirms the punch themselves.
				router.navigate("/(tabs)");
			},
		);

		return () => subscription.remove();
	}, [queryClient]);
}
