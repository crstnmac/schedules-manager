import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const enabled = Platform.OS === "ios";

/** Light tick for taps and toggles. */
export function tapLight() {
	if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium tick for committing an action (clock in, submit). */
export function tapMedium() {
	if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Success pattern for acceptances and completions. */
export function tapSuccess() {
	if (enabled)
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Warning pattern for destructive confirmations. */
export function tapWarning() {
	if (enabled)
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
