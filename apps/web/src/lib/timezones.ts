const EXTRA_TIME_ZONES = ["Asia/Kolkata", "Asia/Ho_Chi_Minh", "Europe/Kyiv"];

export type TimeZoneOption = {
	id: string;
	label: string;
	region: string;
	search: string;
};

export function ianaTimeZones(): string[] {
	const zones = new Set(
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("timeZone")
			: ["UTC"],
	);
	for (const extra of EXTRA_TIME_ZONES) {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: extra });
			zones.add(extra);
		} catch {
			// Engine does not accept this identifier.
		}
	}
	return [...zones];
}

let offsetCacheAt = 0;
const offsetCache = new Map<string, string>();

export function timezoneOffsetLabel(
	timeZone: string,
	at: Date = new Date(),
): string {
	const bucket = Math.floor(at.getTime() / 3_600_000);
	if (bucket !== offsetCacheAt) {
		offsetCache.clear();
		offsetCacheAt = bucket;
	}
	const cached = offsetCache.get(timeZone);
	if (cached !== undefined) return cached;
	try {
		const part = new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "shortOffset",
		})
			.formatToParts(at)
			.find((entry) => entry.type === "timeZoneName")?.value;
		const label = part?.replace("GMT", "UTC") ?? "";
		offsetCache.set(timeZone, label);
		return label;
	} catch {
		offsetCache.set(timeZone, "");
		return "";
	}
}

export function timezoneLabel(timeZone: string, at?: Date): string {
	const offset = timezoneOffsetLabel(timeZone, at);
	const name = timeZone.replaceAll("_", " ");
	return offset ? `${name} (${offset})` : name;
}

function regionOf(timeZone: string): string {
	const slash = timeZone.indexOf("/");
	return slash === -1 ? "Other" : timeZone.slice(0, slash);
}

let optionsCacheAt = 0;
let optionsCache: TimeZoneOption[] = [];

export function timeZoneOptions(current?: string): TimeZoneOption[] {
	const bucket = Math.floor(Date.now() / 3_600_000);
	if (bucket !== optionsCacheAt || optionsCache.length === 0) {
		optionsCacheAt = bucket;
		optionsCache = ianaTimeZones().map((id) => {
			const label = timezoneLabel(id);
			return {
				id,
				label,
				region: regionOf(id),
				search: `${id.replaceAll("_", " ")} ${label}`.toLowerCase(),
			};
		});
	}
	if (current && !optionsCache.some((option) => option.id === current)) {
		const label = timezoneLabel(current);
		return [
			{
				id: current,
				label,
				region: regionOf(current),
				search: `${current.replaceAll("_", " ")} ${label}`.toLowerCase(),
			},
			...optionsCache,
		];
	}
	return optionsCache;
}

function compactOffset(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(" ", "")
		.replaceAll(":", "")
		.replace(/([+-])0+(\d)/g, "$1$2");
}

export function filterTimeZoneOptions(
	query: string,
	options = timeZoneOptions(),
): TimeZoneOption[] {
	const needle = query.trim().toLowerCase().replaceAll("_", " ");
	if (!needle) return options;
	const compact = compactOffset(needle);
	const offsetQuery = /utc|gmt|[+-]\d/.test(needle);
	return options.filter((option) => {
		if (option.search.includes(needle)) return true;
		return (
			offsetQuery &&
			compact.length >= 2 &&
			compactOffset(option.search).includes(compact)
		);
	});
}

export function filterTimeZones(query: string, zones?: string[]): string[] {
	const options = zones
		? timeZoneOptions().filter((option) => zones.includes(option.id))
		: timeZoneOptions();
	return filterTimeZoneOptions(query, options).map((option) => option.id);
}

export function groupTimeZones(options: TimeZoneOption[]): {
	region: string;
	zones: TimeZoneOption[];
}[] {
	const groups = new Map<string, TimeZoneOption[]>();
	for (const option of options) {
		const list = groups.get(option.region);
		if (list) list.push(option);
		else groups.set(option.region, [option]);
	}
	return [...groups].map(([region, grouped]) => ({
		region,
		zones: grouped,
	}));
}
