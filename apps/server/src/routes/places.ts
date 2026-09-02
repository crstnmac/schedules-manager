import { Elysia, t } from "elysia";

import { requireSession } from "../context";
import { BadRequestError } from "../errors";
import { AUSTIN_BIAS, geocodeClient } from "../geocode";
import { consumeRateLimitOrThrow } from "../rate-limit";

const placeSchema = t.Object({
	osmId: t.String(),
	name: t.String(),
	addressLine: t.String(),
	latitude: t.String(),
	longitude: t.String(),
	timezone: t.Union([t.String(), t.Null()]),
	city: t.Union([t.String(), t.Null()]),
	state: t.Union([t.String(), t.Null()]),
});

export const placesRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Location"],
})
	.get(
		"/places",
		async ({ headers, query }) => {
			const { profile } = await requireSession(headers.authorization);
			consumeRateLimitOrThrow(`places.search:${profile.id}`, "placeSearch");
			const biasLat = query.lat ?? AUSTIN_BIAS.latitude;
			const biasLon = query.lon ?? AUSTIN_BIAS.longitude;
			const places = await geocodeClient().search(query.q, {
				latitude: biasLat,
				longitude: biasLon,
			});
			return { places };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			query: t.Object({
				q: t.String({ minLength: 1, maxLength: 200 }),
				lat: t.Optional(t.Number()),
				lon: t.Optional(t.Number()),
			}),
			response: t.Object({ places: t.Array(placeSchema) }),
			detail: {
				summary: "Search Places for a Location address (signed-in)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/places/reverse",
		async ({ headers, query }) => {
			const { profile } = await requireSession(headers.authorization);
			consumeRateLimitOrThrow(`places.search:${profile.id}`, "placeSearch");
			if (
				query.lat < -90 ||
				query.lat > 90 ||
				query.lon < -180 ||
				query.lon > 180
			) {
				throw new BadRequestError("Coordinates are out of range");
			}
			const place = await geocodeClient().reverse(query.lat, query.lon);
			return { place };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			query: t.Object({
				lat: t.Number(),
				lon: t.Number(),
			}),
			response: t.Object({
				place: t.Union([placeSchema, t.Null()]),
			}),
			detail: {
				summary: "Reverse-geocode coordinates to a Place (signed-in)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
