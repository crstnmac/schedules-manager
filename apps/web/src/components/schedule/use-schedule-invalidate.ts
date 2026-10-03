import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * Returns a stable function that marks the week under edit (and this
 * location's calendar) stale and refetches the week.
 *
 * Only that week and calendar go stale — invalidating the ["schedule"] prefix
 * would mark every location/week stale and refetch them on visit. Shift edits
 * change labor, but not time-clock state (punches live on published versions).
 */
export function useInvalidateSchedule(
	locationId: string | undefined,
	weekStart: string,
	teamId: string | null,
) {
	const queryClient = useQueryClient();
	return useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: ["schedule", locationId, weekStart, teamId],
		});
		await queryClient.invalidateQueries({
			queryKey: ["schedule-labor", locationId, weekStart, teamId],
		});
		await queryClient.invalidateQueries({
			queryKey: ["schedule-calendar", locationId, teamId],
		});
		await queryClient.refetchQueries({
			queryKey: ["schedule", locationId, weekStart, teamId],
		});
	}, [queryClient, locationId, weekStart, teamId]);
}
