export type PickerMode = "date" | "time";

/** Parse the machine strings the app stores ("YYYY-MM-DD" / "HH:mm") into a Date. */
export function dateTimeValue(raw: string, mode: PickerMode): Date {
	const fallback = new Date();
	if (mode === "time") {
		const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
		const d = new Date();
		if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) {
			d.setHours(Number(m[1]), Number(m[2]), 0, 0);
		} else {
			d.setHours(9, 0, 0, 0);
		}
		return d;
	}
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : fallback;
}

export function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function hhmmFrom(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(
		d.getMinutes(),
	).padStart(2, "0")}`;
}

export function formatPickerValue(
	raw: string,
	mode: PickerMode,
	tmp: Date,
): string {
	if (mode === "date")
		return raw
			? tmp.toLocaleDateString(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
				})
			: "Choose date";
	return raw || "Choose time";
}
