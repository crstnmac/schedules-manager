import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useStackScreenOptions } from "@/components/navigation/stack";
import { SessionGate } from "@/components/session-gate";
import { AuthProvider } from "@/lib/auth";
import { useAppTheme } from "@/theme";

export const unstable_settings = {
	initialRouteName: "(tabs)",
};

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Backgrounding/foregrounding must not refetch every active query;
			// fresh data is reused and volatile screens opt out per hook.
			staleTime: 30_000,
			retry: 1,
			refetchOnMount: true,
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
		},
	},
});

export default function RootLayout() {
	const { theme, colorScheme } = useAppTheme();
	const screenOptions = useStackScreenOptions();
	const navigationTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;

	return (
		<ThemeProvider
			value={{
				...navigationTheme,
				colors: {
					...navigationTheme.colors,
					primary: theme.tint,
					background: theme.background,
					card: theme.surface,
					text: theme.text,
					border: theme.border,
					notification: theme.danger,
				},
			}}
		>
			<QueryClientProvider client={queryClient}>
				<AuthProvider>
					<StatusBar style="auto" />
					<SafeAreaProvider>
						<GestureHandlerRootView
							style={{ flex: 1, backgroundColor: theme.background }}
						>
							<SessionGate>
								<Stack screenOptions={screenOptions}>
									<Stack.Screen
										name="(tabs)"
										options={{ headerShown: false }}
									/>
									<Stack.Screen
										name="shift-detail"
										options={{ title: "Shift" }}
									/>
									<Stack.Screen
										name="worker-availability"
										options={{ title: "Time Off" }}
									/>
									<Stack.Screen
										name="timecard"
										options={{ title: "Timecard" }}
									/>
									<Stack.Screen
										name="team"
										options={{ title: "Team", headerLargeTitleEnabled: true }}
									/>
									<Stack.Screen
										name="announcements"
										options={{ title: "Announcements" }}
									/>
									<Stack.Screen
										name="messages"
										options={{
											title: "Messages",
											headerLargeTitleEnabled: true,
										}}
									/>
									<Stack.Screen name="conversation/[id]" />
									<Stack.Screen name="kiosk" options={{ title: "Kiosk" }} />
									<Stack.Screen
										name="time-off-sheet"
										options={{
											title: "Add time off",
											presentation: "modal",
											headerLargeTitleEnabled: false,
										}}
									/>
									<Stack.Screen
										name="+not-found"
										options={{ title: "Not found" }}
									/>
								</Stack>
							</SessionGate>
						</GestureHandlerRootView>
					</SafeAreaProvider>
				</AuthProvider>
			</QueryClientProvider>
		</ThemeProvider>
	);
}
