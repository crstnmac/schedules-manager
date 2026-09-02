import { find } from "geo-tz";

import { parseLatitude, parseLongitude } from "./geo";

const AUSTIN_BIAS = { latitude: 30.2672, longitude: -97.7431 };
const MIN_QUERY_LENGTH = 3;
const SEARCH_LIMIT = 6;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const USER_AGENT = "jooling/0.1 (workforce scheduling; place search)";

const STATE_ABBREVIATIONS: Record<string, string> = {
	alabama: "AL",
	alaska: "AK",
	arizona: "AZ",
	arkansas: "AR",
	california: "CA",
	colorado: "CO",
	connecticut: "CT",
	delaware: "DE",
	florida: "FL",
	georgia: "GA",
	hawaii: "HI",
	idaho: "ID",
	illinois: "IL",
	indiana: "IN",
	iowa: "IA",
	kansas: "KS",
	kentucky: "KY",
	louisiana: "LA",
	maine: "ME",
	maryland: "MD",
	massachusetts: "MA",
	michigan: "MI",
	minnesota: "MN",
	mississippi: "MS",
	missouri: "MO",
	montana: "MT",
	nebraska: "NE",
	nevada: "NV",
	"new hampshire": "NH",
	"new jersey": "NJ",
	"new mexico": "NM",
	"new york": "NY",
	"north carolina": "NC",
	"north dakota": "ND",
	ohio: "OH",
	oklahoma: "OK",
	oregon: "OR",
	pennsylvania: "PA",
	"rhode island": "RI",
	"south carolina": "SC",
	"south dakota": "SD",
	tennessee: "TN",
	texas: "TX",
	utah: "UT",
	vermont: "VT",
	virginia: "VA",
	washington: "WA",
	"west virginia": "WV",
	wisconsin: "WI",
	wyoming: "WY",
	"district of columbia": "DC",
};

export type PhotonProperties = {
	name?: string;
	street?: string;
	housenumber?: string;
	postcode?: string;
	city?: string;
	town?: string;
	village?: string;
	district?: string;
	county?: string;
	state?: string;
	country?: string;
	countrycode?: string;
	osm_key?: string;
	osm_value?: string;
	osm_type?: string;
	osm_id?: number;
};

export type PhotonFeature = {
	type?: string;
	geometry?: { type?: string; coordinates?: unknown };
	properties?: PhotonProperties;
};

export type Place = {
	osmId: string;
	name: string;
	addressLine: string;
	latitude: string;
	longitude: string;
	timezone: string | null;
	city: string | null;
	state: string | null;
};

type CacheEntry = { expiresAt: number; places: Place[] };

export type GeocodeFetch = (
	input: string,
	init?: RequestInit,
) => Promise<Response>;

export type GeocodeClient = {
	search(
		query: string,
		bias?: { latitude: number; longitude: number },
	): Promise<Place[]>;
	reverse(latitude: number, longitude: number): Promise<Place | null>;
};

export { AUSTIN_BIAS, MIN_QUERY_LENGTH };

export function abbreviateState(state: string | undefined): string | undefined {
	if (!state) return undefined;
	const trimmed = state.trim();
	if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
	return STATE_ABBREVIATIONS[trimmed.toLowerCase()] ?? trimmed;
}

export function timezoneForCoordinates(
	latitude: number,
	longitude: number,
): string | null {
	if (
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		latitude < -90 ||
		latitude > 90 ||
		longitude < -180 ||
		longitude > 180
	) {
		return null;
	}
	try {
		return find(latitude, longitude)[0] ?? null;
	} catch {
		return null;
	}
}

export function formatPlaceAddress(properties: PhotonProperties): string {
	const street = [properties.housenumber, properties.street]
		.filter(Boolean)
		.join(" ");
	const locality =
		properties.city ??
		properties.town ??
		properties.village ??
		properties.district ??
		null;
	const state = abbreviateState(properties.state);
	const region = [state, properties.postcode].filter(Boolean).join(" ");
	const named =
		properties.name &&
		properties.name !== properties.street &&
		properties.name !== street
			? properties.name
			: null;
	return [named, street || null, locality, region || null]
		.filter((part): part is string => Boolean(part))
		.join(", ");
}

export function placeFromPhotonFeature(feature: PhotonFeature): Place | null {
	const coordinates = feature.geometry?.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
	const longitude = Number(coordinates[0]);
	const latitude = Number(coordinates[1]);
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
		return null;
	}
	const properties = feature.properties ?? {};
	const addressLine = formatPlaceAddress(properties);
	const name = properties.name?.trim() || addressLine;
	if (!name) return null;
	const osmId =
		properties.osm_type && properties.osm_id != null
			? `${properties.osm_type}:${properties.osm_id}`
			: `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
	return {
		osmId,
		name,
		addressLine: addressLine || name,
		latitude: String(latitude),
		longitude: String(longitude),
		timezone: timezoneForCoordinates(latitude, longitude),
		city:
			properties.city ??
			properties.town ??
			properties.village ??
			properties.district ??
			null,
		state: abbreviateState(properties.state) ?? null,
	};
}

export function placesFromPhoton(payload: unknown): Place[] {
	if (!payload || typeof payload !== "object") return [];
	const features = (payload as { features?: unknown }).features;
	if (!Array.isArray(features)) return [];
	const seen = new Set<string>();
	const places: Place[] = [];
	for (const feature of features) {
		const place = placeFromPhotonFeature(feature as PhotonFeature);
		if (!place || seen.has(place.osmId)) continue;
		seen.add(place.osmId);
		places.push(place);
	}
	return places;
}

function normalizeQuery(query: string): string {
	return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createGeocodeClient(
	options: { baseUrl?: string; fetch?: GeocodeFetch; now?: () => number } = {},
): GeocodeClient {
	const baseUrl = (options.baseUrl ?? "https://photon.komoot.io").replace(
		/\/$/,
		"",
	);
	const fetchFn = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const cache = new Map<string, CacheEntry>();

	function readCache(key: string): Place[] | null {
		const entry = cache.get(key);
		if (!entry) return null;
		if (entry.expiresAt <= now()) {
			cache.delete(key);
			return null;
		}
		return entry.places;
	}

	function writeCache(key: string, places: Place[]) {
		if (cache.size >= CACHE_MAX) {
			const first = cache.keys().next().value;
			if (first) cache.delete(first);
		}
		cache.set(key, { expiresAt: now() + CACHE_TTL_MS, places });
	}

	async function request(path: string): Promise<Place[]> {
		const response = await fetchFn(`${baseUrl}${path}`, {
			headers: {
				Accept: "application/json",
				"User-Agent": USER_AGENT,
			},
			signal: AbortSignal.timeout(4_000),
		});
		if (!response.ok) return [];
		try {
			return placesFromPhoton(await response.json());
		} catch {
			return [];
		}
	}

	return {
		async search(query, bias = AUSTIN_BIAS) {
			const normalized = normalizeQuery(query);
			if (normalized.length < MIN_QUERY_LENGTH) return [];
			const cacheKey = `search:${normalized}:${bias.latitude.toFixed(3)},${bias.longitude.toFixed(3)}`;
			const cached = readCache(cacheKey);
			if (cached) return cached;
			const params = new URLSearchParams({
				q: query.trim(),
				limit: String(SEARCH_LIMIT),
				lang: "en",
				lat: String(bias.latitude),
				lon: String(bias.longitude),
				zoom: "12",
			});
			const places = await request(`/api?${params.toString()}`);
			writeCache(cacheKey, places);
			return places;
		},
		async reverse(latitude, longitude) {
			if (
				!Number.isFinite(latitude) ||
				!Number.isFinite(longitude) ||
				latitude < -90 ||
				latitude > 90 ||
				longitude < -180 ||
				longitude > 180
			) {
				return null;
			}
			const cacheKey = `reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
			const cached = readCache(cacheKey);
			if (cached) return cached[0] ?? null;
			const params = new URLSearchParams({
				lat: String(latitude),
				lon: String(longitude),
				limit: "1",
				lang: "en",
			});
			const places = await request(`/reverse?${params.toString()}`);
			writeCache(cacheKey, places);
			return places[0] ?? null;
		},
	};
}

let defaultClient: GeocodeClient | undefined;

export function geocodeClient(): GeocodeClient {
	defaultClient ??= createGeocodeClient({
		baseUrl: process.env.GEOCODER_BASE_URL,
	});
	return defaultClient;
}

export async function geocodeAddress(
	addressLine: string,
	client: GeocodeClient = geocodeClient(),
): Promise<Place | null> {
	const places = await client.search(addressLine);
	return places[0] ?? null;
}

export async function fillPlaceFromAddress(input: {
	addressLine?: string | null;
	latitude?: string | null;
	longitude?: string | null;
	client?: GeocodeClient;
}): Promise<{
	latitude: string | null;
	longitude: string | null;
	timezone: string | null;
}> {
	let latitude = parseLatitude(input.latitude);
	let longitude = parseLongitude(input.longitude);
	if ((latitude == null || longitude == null) && input.addressLine?.trim()) {
		const place = await geocodeAddress(
			input.addressLine,
			input.client ?? geocodeClient(),
		);
		if (place) {
			latitude ??= place.latitude;
			longitude ??= place.longitude;
		}
	}
	return {
		latitude,
		longitude,
		timezone:
			latitude != null && longitude != null
				? timezoneForCoordinates(Number(latitude), Number(longitude))
				: null,
	};
}
