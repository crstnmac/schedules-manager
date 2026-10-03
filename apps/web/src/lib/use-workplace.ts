import { useMe } from "./queries";
import { setWorkplaceTimeZone } from "./time";

const NO_CAPABILITIES = { scheduling: false, operations: false };

export function useWorkplace() {
	const me = useMe();
	const employments = me.data?.employments ?? [];
	const employment =
		employments.find((item) => item.kind === "manager") ?? employments[0];
	// Pages render after the shell has loaded /v1/me, so formatting helpers
	// see the workplace's zone on their first render.
	setWorkplaceTimeZone(employment?.workplace.timezone);
	return {
		isLoading: me.isLoading,
		workplace: employment?.workplace ?? null,
		kind: employment?.kind ?? null,
		employmentId: employment?.id ?? null,
		privileges: employment?.privileges ?? null,
		capabilities: employment?.capabilities ?? NO_CAPABILITIES,
	};
}
