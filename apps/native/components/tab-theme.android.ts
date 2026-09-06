import { useAppTheme } from "@/components/ui.android";
export function useTabTheme() {
	return useAppTheme().material;
}
