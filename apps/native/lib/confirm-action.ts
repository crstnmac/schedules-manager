import { Alert } from "react-native";

export function confirmAction({
	title,
	message,
	confirmLabel,
	onConfirm,
	destructive = false,
}: {
	title: string;
	message: string;
	confirmLabel: string;
	onConfirm: () => void;
	destructive?: boolean;
}) {
	Alert.alert(title, message, [
		{ text: "Cancel", style: "cancel" },
		{
			text: confirmLabel,
			style: destructive ? "destructive" : "default",
			onPress: onConfirm,
		},
	]);
}
