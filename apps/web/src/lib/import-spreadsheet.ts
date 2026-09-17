/** Preserve spreadsheet cells as RFC 4180 CSV for the server's import preview. */
export function spreadsheetRowsToCsv(rows: unknown[][]): string {
	return rows
		.map((row) =>
			row
				.map((value) => {
					let text = value == null ? "" : String(value);
					if (value instanceof Date) {
						text =
							value.getUTCFullYear() < 1901
								? `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`
								: value.toISOString().slice(0, 10);
					}
					return `"${text.replaceAll('"', '""')}"`;
				})
				.join(","),
		)
		.join("\r\n");
}
