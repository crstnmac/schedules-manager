import { describe, expect, test } from "bun:test";

import { assertClockInGeofence } from "../src/geo";

describe("clock-in geofence policy", () => {
	test("skips the check when the Location has no geofence and it is not required", () => {
		expect(() =>
			assertClockInGeofence({
				geofenceRequired: false,
				latitude: null,
				longitude: null,
				geofenceRadiusMeters: null,
			}),
		).not.toThrow();
	});

	test("requires a Location geofence when the Workplace policy is on", () => {
		expect(() =>
			assertClockInGeofence({
				geofenceRequired: true,
				latitude: null,
				longitude: null,
				geofenceRadiusMeters: null,
			}),
		).toThrow("This Workplace requires a Location Geofence for clock-in");
	});

	test("still checks coordinates when a Location geofence is configured", () => {
		expect(() =>
			assertClockInGeofence({
				geofenceRequired: false,
				latitude: "30.2672",
				longitude: "-97.7431",
				geofenceRadiusMeters: 100,
			}),
		).toThrow("This Location requires a Geofence check");
	});
});
