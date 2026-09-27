import { ActionSheetIOS, Alert } from "react-native";

export type SheetAction = {
	label: string;
	onPress: () => void;
	destructive?: boolean;
};

/**
 * Native overflow menu: a system action sheet on iOS, an alert dialog on
 * Android (at most three actions there, so keep lists short).
 */
export function showActionSheet({
	title,
	message,
	actions,
}: {
	title?: string;
	message?: string;
	actions: SheetAction[];
}) {
	if (process.env.EXPO_OS === "ios") {
		const options = [...actions.map((action) => action.label), "Cancel"];
		ActionSheetIOS.showActionSheetWithOptions(
			{
				title,
				message,
				options,
				cancelButtonIndex: options.length - 1,
				destructiveButtonIndex: actions
					.map((action, index) => (action.destructive ? index : -1))
					.filter((index) => index >= 0),
			},
			(index) => actions[index]?.onPress(),
		);
		return;
	}
	// Android dialogs hold three buttons. With three actions, drop the explicit
	// Cancel and let a tap outside (or Back) dismiss instead.
	const buttons = actions.slice(0, 3).map((action) => ({
		text: action.label,
		style: action.destructive ? ("destructive" as const) : ("default" as const),
		onPress: action.onPress,
	}));
	Alert.alert(
		title ?? "Options",
		message,
		buttons.length < 3
			? [{ text: "Cancel", style: "cancel" as const }, ...buttons]
			: buttons,
		{ cancelable: true },
	);
}
