export function formatDayShort(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

export function formatDayLong(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}
