import { Host, List } from "@expo/ui";
import type { ReactNode } from "react";
import { useAppTheme } from "@/components/ui";

export function SettingsGroup({ children }: { children: ReactNode }) {
	const { colorScheme, theme } = useAppTheme();
	return (
		<Host
			matchContents={{ vertical: true }}
			colorScheme={colorScheme}
			seedColor={theme.primary}
			style={{ alignSelf: "stretch" }}
		>
			<List>{children}</List>
		</Host>
	);
}
