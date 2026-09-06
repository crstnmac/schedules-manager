import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionGate } from "@/components/session-gate";
import { useAppTheme } from "@/components/ui";
import { AuthProvider } from "@/lib/auth";
import { useColorScheme } from "@/lib/use-color-scheme";

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

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});

export default function RootLayout() {
	const { colorScheme } = useColorScheme();
	const { theme } = useAppTheme();
	// Native navigation bar with back button + title for every pushed screen.
	const header = {
		headerShadowVisible: false,
		headerStyle: { backgroundColor: theme.background },
		headerTintColor: theme.primary,
		headerTitleStyle: { color: theme.text, fontWeight: "600" as const },
	};

	return (
		<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<QueryClientProvider client={queryClient}>
				<AuthProvider>
					<StatusBar style="auto" />
					<SafeAreaProvider>
						<GestureHandlerRootView style={styles.container}>
							<SessionGate>
								<Stack>
									<Stack.Screen
										name="(tabs)"
										options={{ headerShown: false }}
									/>
									<Stack.Screen
										name="worker-availability"
										options={{ title: "Time Off", ...header }}
									/>
									<Stack.Screen
										name="timecard"
										options={{ title: "My Timecard", ...header }}
									/>
									<Stack.Screen
										name="team"
										options={{ title: "Team", ...header }}
									/>
									<Stack.Screen
										name="announcements"
										options={{ title: "Announcements", ...header }}
									/>
									<Stack.Screen
										name="messages"
										options={{ title: "Messages", ...header }}
									/>
									<Stack.Screen
										name="kiosk"
										options={{ title: "Kiosk", ...header }}
									/>
									<Stack.Screen
										name="shift-detail"
										options={{
											title: "Shift",
											presentation: "card",
											...header,
										}}
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
