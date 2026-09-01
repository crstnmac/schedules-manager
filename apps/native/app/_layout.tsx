import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionGate } from "@/components/session-gate";
import { AuthProvider } from "@/lib/auth";

export const unstable_settings = {
	initialRouteName: "(tabs)",
};

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0,
			retry: 1,
			refetchOnMount: "always",
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
	return (
		<ThemeProvider value={DefaultTheme}>
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
										options={{ headerShown: false }}
									/>
									<Stack.Screen
										name="timecard"
										options={{ headerShown: false }}
									/>
									<Stack.Screen name="team" options={{ headerShown: false }} />
								</Stack>
							</SessionGate>
						</GestureHandlerRootView>
					</SafeAreaProvider>
				</AuthProvider>
			</QueryClientProvider>
		</ThemeProvider>
	);
}
