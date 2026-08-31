export interface WorkerImportRow {
	name?: string;
	email: string;
	phone?: string;
	position?: string;
	location?: string;
}

function csvFields(line: string): string[] {
	const fields: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === '"' && quoted && line[index + 1] === '"') {
			field += '"';
			index += 1;
		} else if (character === '"') {
			quoted = !quoted;
		} else if (character === "," && !quoted) {
			fields.push(field.trim());
			field = "";
		} else {
			field += character;
		}
	}
	fields.push(field.trim());
	return fields;
}

export function parseWorkerCsv(source: string): WorkerImportRow[] {
	const lines = source.split(/\r?\n/).filter((line) => line.trim());
	if (lines.length < 2)
		throw new Error("The CSV needs a header and at least one worker.");
	const headers = csvFields(lines[0] ?? "").map((value) => value.toLowerCase());
	const emailIndex = headers.indexOf("email");
	if (emailIndex < 0) throw new Error("The CSV needs an email column.");
	const valueAt = (values: string[], key: string) => {
		const index = headers.indexOf(key);
		return index < 0 ? undefined : values[index]?.trim() || undefined;
	};
	return lines
		.slice(1)
		.map((line) => {
			const values = csvFields(line);
			return {
				name: valueAt(values, "name"),
				email: values[emailIndex]?.trim() ?? "",
				phone: valueAt(values, "phone"),
				position: valueAt(values, "position"),
				location: valueAt(values, "location"),
			};
		})
		.filter((row) => row.email);
}
