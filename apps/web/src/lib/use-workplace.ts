import { useMe } from "./queries";

export function useWorkplace() {
	const me = useMe();
	const employments = me.data?.employments ?? [];
	const employment =
		employments.find((item) => item.kind === "manager") ?? employments[0];
	return {
		isLoading: me.isLoading,
		workplace: employment?.workplace ?? null,
		kind: employment?.kind ?? null,
		employmentId: employment?.id ?? null,
	};
}
