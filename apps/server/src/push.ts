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

interface ExpoPushTicket {
	status: "ok" | "error";
	id?: string;
	code?: string;
	message?: string;
}

export async function sendExpoPush(
	messages: ExpoPushMessage[],
): Promise<{ invalidTokens: string[] }> {
	const invalidTokens: string[] = [];

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
		tickets.forEach((ticket, index) => {
			if (ticket.status === "error" && ticket.code === "DeviceNotRegistered") {
				const token = batch[index]?.to;
				if (token) invalidTokens.push(token);
			}
		});
	}

	return { invalidTokens };
}
