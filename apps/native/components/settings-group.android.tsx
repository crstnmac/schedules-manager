import { Host } from "@expo/ui";
import { Column } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactNode } from "react";
import { BRAND_SEED, useAppTheme } from "@/components/ui.android";

/** Fixed settings rows share the screen's scroll view; List uses LazyColumn on Android. */
export function SettingsGroup({ children }: { children: ReactNode }) {
	const { colorScheme } = useAppTheme();
	return (
		<Host
			matchContents={{ vertical: true }}
			colorScheme={colorScheme}
			seedColor={BRAND_SEED[colorScheme]}
			style={{ width: "100%" }}
		>
			<Column modifiers={[fillMaxWidth()]}>{children}</Column>
		</Host>
	);
}
