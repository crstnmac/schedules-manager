import { BadRequestError } from "./errors";

const EARTH_METERS = 6_371_000;

export function distanceMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const toRad = (value: number) => (value * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideGeofence(input: {
	latitude: number;
	longitude: number;
	centerLatitude: number;
	centerLongitude: number;
	radiusMeters: number;
}): boolean {
	return (
		distanceMeters(
			input.latitude,
			input.longitude,
			input.centerLatitude,
			input.centerLongitude,
		) <= input.radiusMeters
	);
}

export function assertClockInGeofence(input: {
	geofenceRequired: boolean;
	latitude: string | null;
	longitude: string | null;
	geofenceRadiusMeters: number | null;
	coords?: { latitude?: number; longitude?: number };
}) {
	const configured =
		Boolean(input.latitude) &&
		Boolean(input.longitude) &&
		input.geofenceRadiusMeters != null &&
		input.geofenceRadiusMeters > 0;

	if (!configured) {
		if (input.geofenceRequired) {
			throw new BadRequestError(
				"This Workplace requires a Location Geofence for clock-in",
			);
		}
		return;
	}

	if (input.coords?.latitude == null || input.coords.longitude == null) {
		throw new BadRequestError("This Location requires a Geofence check");
	}
	if (
		!isInsideGeofence({
			latitude: input.coords.latitude,
			longitude: input.coords.longitude,
			centerLatitude: Number(input.latitude),
			centerLongitude: Number(input.longitude),
			radiusMeters: input.geofenceRadiusMeters ?? 0,
		})
	) {
		throw new BadRequestError("You are outside this Location's Geofence");
	}
}

export function parseLatitude(value: string | null | undefined): string | null {
	if (value == null || value.trim() === "") return null;
	const n = Number(value);
	if (!Number.isFinite(n) || n < -90 || n > 90) {
		throw new BadRequestError("Latitude must be between -90 and 90");
	}
	return String(n);
}

export function parseLongitude(
	value: string | null | undefined,
): string | null {
	if (value == null || value.trim() === "") return null;
	const n = Number(value);
	if (!Number.isFinite(n) || n < -180 || n > 180) {
		throw new BadRequestError("Longitude must be between -180 and 180");
	}
	return String(n);
}

export function roundToMinutes(instant: Date, minutes: number): Date {
	if (minutes <= 0) return instant;
	const ms = minutes * 60_000;
	return new Date(Math.round(instant.getTime() / ms) * ms);
}
