import { describe, expect, test } from "bun:test";

import {
	createGeocodeClient,
	fillPlaceFromAddress,
	formatPlaceAddress,
	type PhotonFeature,
	placeFromPhotonFeature,
	placesFromPhoton,
	timezoneForCoordinates,
} from "../src/geocode";

const franklin: PhotonFeature = {
	type: "Feature",
	geometry: { type: "Point", coordinates: [-97.7314, 30.2701] },
	properties: {
		name: "Franklin Barbecue",
		housenumber: "900",
		street: "East 11th Street",
		city: "Austin",
		state: "Texas",
		postcode: "78702",
		countrycode: "US",
		osm_type: "N",
		osm_id: 123,
	},
};

describe("place address formatting", () => {
	test("formats a named restaurant with a street address", () => {
		expect(formatPlaceAddress(franklin.properties ?? {})).toBe(
			"Franklin Barbecue, 900 East 11th Street, Austin, TX 78702",
		);
	});

	test("does not repeat the street when it is also the name", () => {
		expect(
			formatPlaceAddress({
				name: "East 11th Street",
				housenumber: "900",
				street: "East 11th Street",
				city: "Austin",
				state: "TX",
				postcode: "78702",
			}),
		).toBe("900 East 11th Street, Austin, TX 78702");
	});
});

describe("timezone from coordinates", () => {
	test("resolves zones across continents", () => {
		expect(timezoneForCoordinates(30.2672, -97.7431)).toBe("America/Chicago");
		expect(timezoneForCoordinates(31.7619, -106.485)).toBe("America/Denver");
		expect(timezoneForCoordinates(33.4484, -112.074)).toBe("America/Phoenix");
		expect(timezoneForCoordinates(51.5074, -0.1278)).toBe("Europe/London");
		expect(timezoneForCoordinates(19.076, 72.8777)).toBe("Asia/Kolkata");
		expect(timezoneForCoordinates(-36.8485, 174.7633)).toBe("Pacific/Auckland");
	});
});

describe("Photon feature mapping", () => {
	test("reads GeoJSON lon/lat order and OSM identity", () => {
		expect(placeFromPhotonFeature(franklin)).toMatchObject({
			osmId: "N:123",
			name: "Franklin Barbecue",
			latitude: "30.2701",
			longitude: "-97.7314",
			timezone: "America/Chicago",
			city: "Austin",
			state: "TX",
		});
	});

	test("drops features without a usable point", () => {
		expect(
			placesFromPhoton({
				features: [
					franklin,
					{
						geometry: { coordinates: ["x", "y"] },
						properties: { name: "Bad" },
					},
					franklin,
				],
			}),
		).toHaveLength(1);
	});
});

describe("Photon client", () => {
	test("searches, caches, and skips short queries", async () => {
		let calls = 0;
		const client = createGeocodeClient({
			fetch: async (input) => {
				calls += 1;
				expect(String(input)).toContain("q=Franklin+Barbecue");
				expect(String(input)).not.toContain("countrycode=");
				return new Response(JSON.stringify({ features: [franklin] }), {
					headers: { "content-type": "application/json" },
				});
			},
		});
		expect(await client.search("ab")).toEqual([]);
		const first = await client.search("Franklin Barbecue");
		const second = await client.search("  franklin   barbecue ");
		expect(first[0]?.name).toBe("Franklin Barbecue");
		expect(second).toEqual(first);
		expect(calls).toBe(1);
	});

	test("reverse geocode returns the nearest place", async () => {
		const client = createGeocodeClient({
			fetch: async (input) => {
				expect(String(input)).toContain("/reverse?");
				return new Response(JSON.stringify({ features: [franklin] }));
			},
		});
		const place = await client.reverse(30.2701, -97.7314);
		expect(place?.addressLine).toContain("Franklin Barbecue");
	});
});

describe("fillPlaceFromAddress", () => {
	test("geocodes when coordinates are missing", async () => {
		const client = createGeocodeClient({
			fetch: async () => new Response(JSON.stringify({ features: [franklin] })),
		});
		const filled = await fillPlaceFromAddress({
			addressLine: "Franklin Barbecue Austin",
			client,
		});
		expect(filled).toMatchObject({
			latitude: "30.2701",
			longitude: "-97.7314",
			timezone: "America/Chicago",
		});
	});
});
