export type RequestLogEntry = {
	level: "info" | "error";
	requestId: string;
	method: string;
	path: string;
	status?: number;
	durationMs?: number;
	error?: string;
	timestamp: string;
};

type Sink = (entry: RequestLogEntry) => void;

const defaultSink: Sink = (entry) => {
	const line = JSON.stringify(entry);
	if (entry.level === "error") console.error(line);
	else console.log(line);
};

let sink: Sink = defaultSink;

export function setRequestLogSinkForTests(next: Sink): void {
	sink = next;
}

export function resetRequestLogSink(): void {
	sink = defaultSink;
}

export function writeRequestLog(entry: RequestLogEntry): void {
	sink(entry);
}

export function newRequestId(request: Request): string {
	return request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}
