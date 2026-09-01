import { Ionicons } from "@expo/vector-icons";
import { Appearance, Pressable, StyleSheet, Text, View } from "react-native";

import { NAV_THEME } from "@/lib/constants";

type IconName = keyof typeof Ionicons.glyphMap;

function iconForRoute(routeName: string, focused: boolean): IconName {
	if (routeName === "index") return focused ? "calendar" : "calendar-outline";
	if (routeName === "availability") return focused ? "time" : "time-outline";
	if (routeName === "openshifts")
		return focused ? "hand-left" : "hand-left-outline";
	if (routeName === "inbox")
		return focused ? "notifications" : "notifications-outline";
	if (routeName === "manager-schedule")
		return focused ? "calendar" : "calendar-outline";
	if (routeName === "manager-team")
		return focused ? "people" : "people-outline";
	if (routeName === "manager-requests")
		return focused ? "checkmark-done" : "checkmark-done-outline";
	return focused ? "ellipse" : "ellipse-outline";
}

function labelForRoute(routeName: string): string {
	if (routeName === "index") return "Schedule";
	if (routeName === "availability") return "Availability";
	if (routeName === "openshifts") return "Open shifts";
	if (routeName === "inbox") return "Inbox";
	if (routeName === "manager-schedule") return "Schedule";
	if (routeName === "manager-team") return "Team";
	if (routeName === "manager-requests") return "Requests";
	return routeName;
}

export function BottomNav(props: {
	state: { index: number; routes: { key: string; name: string }[] };
	descriptors: Record<string, { options: { title?: string; href?: unknown } }>;
	navigation: {
		emit: (e: { type: string; target: string }) => {
			defaultPrevented: boolean;
		};
		navigate: (name: string) => void;
	};
	insets: { top: number; bottom: number; left: number; right: number };
}) {
	const { state, descriptors, navigation, insets } = props as unknown as {
		state: { index: number; routes: { key: string; name: string }[] };
		descriptors: Record<
			string,
			{ options: { title?: string; href?: unknown } }
		>;
		navigation: {
			emit: (e: { type: string; target: string }) => {
				defaultPrevented: boolean;
			};
			navigate: (name: string) => void;
		};
		insets: { top: number; bottom: number; left: number; right: number };
	};
	const colorScheme = Appearance.getColorScheme() ?? "light";
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;

	const visibleRoutes = state.routes.filter(
		(route: { key: string; name: string }) => {
			const opts = descriptors[route.key]?.options as
				| { href?: unknown }
				| undefined;
			return opts?.href !== null;
		},
	);

	return (
		<View
			pointerEvents="box-none"
			style={[
				styles.outer,
				{ paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 12 },
			]}
		>
			<View
				style={[
					styles.bar,
					{
						backgroundColor: theme.card,
						borderColor: theme.border,
						shadowColor: theme.shadow,
					},
				]}
			>
				{visibleRoutes.map((route: { key: string; name: string }) => {
					const descriptor = descriptors[route.key];
					const isFocused = state.routes[state.index]?.key === route.key;
					const options = descriptor.options as { title?: string };
					const label = (options.title as string) ?? labelForRoute(route.name);
					const iconName = iconForRoute(route.name, isFocused);

					const onPress = () => {
						const event = navigation.emit({
							type: "tabPress",
							target: route.key,
						});
						if (!isFocused && !event.defaultPrevented)
							navigation.navigate(route.name as never);
					};
					const onLongPress = () =>
						navigation.emit({ type: "tabLongPress", target: route.key });

					return (
						<Pressable
							key={route.key}
							accessibilityRole="button"
							accessibilityState={isFocused ? { selected: true } : {}}
							accessibilityLabel={label}
							onPress={onPress}
							onLongPress={onLongPress}
							hitSlop={6}
							style={({ pressed }) => [
								styles.tab,
								{
									backgroundColor: isFocused
										? `${theme.primary}14`
										: "transparent",
									opacity: pressed ? 0.72 : 1,
								},
							]}
						>
							<View style={styles.iconWrap}>
								<Ionicons
									name={iconName}
									size={22}
									color={isFocused ? theme.primary : theme.muted}
									style={{ marginBottom: 1 }}
								/>
							</View>
							<Text
								numberOfLines={1}
								style={[
									styles.label,
									{
										color: isFocused ? theme.primary : theme.muted,
										fontWeight: isFocused ? "800" : "600",
									},
								]}
							>
								{label}
							</Text>
							{isFocused ? (
								<View
									style={[styles.indicator, { backgroundColor: theme.primary }]}
								/>
							) : null}
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	outer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "transparent",
	},
	bar: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 24,
		height: 64,
		paddingHorizontal: 6,
		gap: 4,
		// Modern production shadow – soft, lifted pill
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.08,
		shadowRadius: 24,
		elevation: 8,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 3,
		minHeight: 52,
		borderRadius: 16,
		paddingVertical: 6,
		paddingHorizontal: 4,
	},
	iconWrap: {
		width: 24,
		height: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	label: {
		fontSize: 10,
		lineHeight: 12,
		letterSpacing: 0.2,
		textAlign: "center",
	},
	indicator: {
		position: "absolute",
		bottom: 4,
		width: 20,
		height: 3,
		borderRadius: 999,
		opacity: 0.9,
	},
});
