import type { LocationDto } from "./queries";

/**
 * Resolves the single location id the web kiosk shows and submits. Deriving
 * one value for both the `<Select>` and the request body keeps the displayed
 * selection in sync with the punch sent (mirrors the native kiosk).
 */
export function resolveSelectedLocationId(
	locationId: string,
	locations: LocationDto[] | undefined,
): string {
	return locationId || locations?.[0]?.id || "";
}
