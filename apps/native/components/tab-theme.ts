import { useAppTheme } from "@/components/ui";
export function useTabTheme() {
	const { theme } = useAppTheme();
	return {
		surfaceContainer: theme.card,
		secondaryContainer: theme.border,
		primaryContainer: theme.card,
		onSurfaceVariant: theme.muted,
		primary: theme.primary,
	};
}
