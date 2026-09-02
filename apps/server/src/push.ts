const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH_SIZE = 100;

export interface ExpoPushMessage {
	to: string;
	title?: string;
	body?: string;
	sound?: "default" | null;
	badge?: number;
	data?: Record<string, unknown>;
	channelId?: string;
}

export interface ExpoPushTicket {
	status: "ok" | "error";
	id?: string;
	code?: string;
	message?: string;
	details?: { error?: string };
}

export function expoError(ticket: ExpoPushTicket) {
	return (
		ticket.details?.error ?? ticket.code ?? ticket.message ?? "UnknownExpoError"
	);
}

export async function getExpoReceipts(
	ids: string[],
): Promise<Record<string, ExpoPushTicket>> {
	const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ ids }),
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok)
		throw new Error(`Expo receipt request failed (${response.status})`);
	const payload = (await response.json()) as {
		data?: Record<string, ExpoPushTicket>;
		errors?: unknown[];
	};
	if (!payload.data || payload.errors?.length)
		throw new Error("Invalid Expo receipt response");
	return payload.data;
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<{
	invalidTokens: string[];
	tickets: { token: string; id: string }[];
	errors: string[];
}> {
	const invalidTokens: string[] = [];
	const accepted: { token: string; id: string }[] = [];
	const errors: string[] = [];

	for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
		const batch = messages.slice(i, i + MAX_BATCH_SIZE);
		if (batch.length === 0) continue;

		const response = await fetch(EXPO_PUSH_URL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"accept-encoding": "gzip, deflate",
			},
			body: JSON.stringify(batch),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			throw new Error(
				`Expo push request failed (${response.status}): ${detail.slice(0, 500)}`,
			);
		}

		const payload = (await response.json()) as {
			data?: ExpoPushTicket[];
			errors?: { code?: string; message?: string }[];
		};

		if (payload.errors && payload.errors.length > 0) {
			throw new Error(
				`Expo push request error: ${payload.errors.map((e) => e.message ?? e.code).join("; ")}`,
			);
		}

		const tickets = payload.data ?? [];
		if (tickets.length !== batch.length)
			throw new Error("Expo ticket count does not match message count");
		tickets.forEach((ticket, index) => {
			const token = batch[index]?.to;
			if (!token) return;
			if (ticket.status === "ok" && ticket.id)
				accepted.push({ token, id: ticket.id });
			else if (
				ticket.status === "error" &&
				expoError(ticket) === "DeviceNotRegistered"
			)
				invalidTokens.push(token);
			else errors.push(expoError(ticket));
		});
	}

	return { invalidTokens, tickets: accepted, errors };
}
