import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ColorValue } from "react-native";

import { useAppTheme } from "@/theme";

/**
 * One registry so every icon is named once and renders platform-native:
 * SF Symbols on iOS (via expo-image `sf:`), Material icons elsewhere.
 */
const ICONS = {
	calendar: { sf: "calendar", md: "calendar-month" },
	calendarDay: { sf: "calendar.day.timeline.left", md: "view-day" },
	calendarPlus: { sf: "calendar.badge.plus", md: "event-available" },
	calendarClock: { sf: "calendar.badge.clock", md: "event-busy" },
	clock: { sf: "clock", md: "schedule" },
	clockFill: { sf: "clock.fill", md: "schedule" },
	stopwatch: { sf: "stopwatch", md: "timer" },
	bell: { sf: "bell", md: "notifications-none" },
	bellFill: { sf: "bell.fill", md: "notifications" },
	briefcase: { sf: "briefcase", md: "work-outline" },
	handRaised: { sf: "hand.raised", md: "back-hand" },
	swap: { sf: "arrow.left.arrow.right", md: "swap-horiz" },
	release: { sf: "arrow.uturn.backward", md: "undo" },
	check: { sf: "checkmark", md: "check" },
	checkCircle: { sf: "checkmark.circle.fill", md: "check-circle" },
	close: { sf: "xmark", md: "close" },
	chevronRight: { sf: "chevron.right", md: "chevron-right" },
	chevronLeft: { sf: "chevron.left", md: "chevron-left" },
	location: { sf: "mappin.and.ellipse", md: "place" },
	person: { sf: "person", md: "person-outline" },
	people: { sf: "person.2", md: "groups" },
	megaphone: { sf: "megaphone", md: "campaign" },
	message: { sf: "bubble.left.and.bubble.right", md: "forum" },
	doc: { sf: "doc.text", md: "description" },
	creditCard: { sf: "creditcard", md: "credit-card" },
	signOut: {
		sf: "rectangle.portrait.and.arrow.right",
		md: "logout",
	},
	building: { sf: "building.2", md: "business" },
	keypad: { sf: "circle.grid.3x3", md: "dialpad" },
	info: { sf: "info.circle", md: "info-outline" },
	warning: { sf: "exclamationmark.triangle.fill", md: "warning-amber" },
	sparkles: { sf: "sparkles", md: "auto-awesome" },
	plus: { sf: "plus", md: "add" },
	minus: { sf: "minus", md: "remove" },
	sun: { sf: "sun.max", md: "wb-sunny" },
	moon: { sf: "moon.stars", md: "nightlight-round" },
	cup: { sf: "cup.and.saucer", md: "free-breakfast" },
	play: { sf: "play.fill", md: "play-arrow" },
	stop: { sf: "stop.fill", md: "stop" },
	list: { sf: "list.bullet", md: "list" },
	checklist: { sf: "checklist", md: "checklist" },
	eye: { sf: "eye", md: "visibility" },
	switch: { sf: "arrow.triangle.2.circlepath", md: "sync-alt" },
	envelope: { sf: "envelope", md: "mail-outline" },
	grid: { sf: "square.grid.2x2", md: "dashboard" },
	pencil: { sf: "pencil", md: "edit" },
	trash: { sf: "trash", md: "delete-outline" },
	history: { sf: "clock.arrow.circlepath", md: "history" },
	checkAll: { sf: "checkmark.circle", md: "done-all" },
	ellipsis: { sf: "ellipsis", md: "more-horiz" },
	bolt: { sf: "bolt.fill", md: "flash-on" },
	banknote: { sf: "banknote", md: "payments" },
	arrowRight: { sf: "arrow.right", md: "arrow-forward" },
	arrowUp: { sf: "arrow.up", md: "arrow-upward" },
	paperclip: { sf: "paperclip", md: "attach-file" },
	airplane: { sf: "airplane", md: "flight" },
	tray: { sf: "tray", md: "inbox" },
} as const satisfies Record<
	string,
	{ sf: string; md: keyof typeof MaterialIcons.glyphMap }
>;

export type IconName = keyof typeof ICONS;

export function Icon({
	name,
	size = 20,
	color,
}: {
	name: IconName;
	size?: number;
	color?: ColorValue;
}) {
	const { theme } = useAppTheme();
	const tint = (color ?? theme.text) as string;
	const icon = ICONS[name];

	if (process.env.EXPO_OS === "ios") {
		return (
			<Image
				source={`sf:${icon.sf}`}
				tintColor={tint}
				style={{ width: size, height: size }}
				contentFit="contain"
				accessible={false}
			/>
		);
	}

	return (
		<MaterialIcons name={icon.md} size={size} color={tint} accessible={false} />
	);
}
