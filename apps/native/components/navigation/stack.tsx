import { type NativeStackNavigationOptions, Stack } from "expo-router";
import { Platform } from "react-native";

import { useAppTheme } from "@/theme";

const isIOS = process.env.EXPO_OS === "ios";
// iOS 26 draws its own scroll-edge glass under a transparent header; adding a
// blur on top of it doubles the effect. Older iOS needs the blur to stay legible.
const hasSystemScrollEdge =
	isIOS && Number.parseInt(String(Platform.Version), 10) >= 26;

/**
 * Header chrome shared by every stack: a translucent native bar on iOS that
 * content scrolls beneath, a flat surface-coloured app bar on Android.
 */
export function useStackScreenOptions({
	largeTitle = false,
}: {
	largeTitle?: boolean;
} = {}): NativeStackNavigationOptions {
	const { theme } = useAppTheme();
	const shared: NativeStackNavigationOptions = {
		contentStyle: { backgroundColor: theme.background },
		headerTintColor: theme.tint,
		headerTitleStyle: { color: theme.text },
		headerShadowVisible: false,
		headerBackButtonDisplayMode: "minimal",
	};
	if (!isIOS)
		return { ...shared, headerStyle: { backgroundColor: theme.background } };
	return {
		...shared,
		headerTransparent: true,
		headerBlurEffect: hasSystemScrollEdge ? undefined : "systemChromeMaterial",
		headerLargeTitleEnabled: largeTitle,
		headerLargeTitleShadowVisible: false,
		headerLargeStyle: { backgroundColor: "transparent" },
		headerLargeTitleStyle: { color: theme.text },
	};
}

/** Stack that lives inside a tab: large collapsing title on iOS. */
export function TabStack({ title }: { title?: string }) {
	const screenOptions = useStackScreenOptions({ largeTitle: true });
	return (
		<Stack screenOptions={screenOptions}>
			<Stack.Screen name="index" options={{ title }} />
		</Stack>
	);
}
