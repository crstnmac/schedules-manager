import { env } from "@SchedulesManager/env/server";

function escapeHtml(value: string) {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[character] ?? character,
	);
}

export async function sendInvitationEmail(input: {
	email: string;
	token: string;
	workplaceName: string;
	kind: string;
	deliveryId: string;
}) {
	const inviteUrl = new URL(
		`/invite/${encodeURIComponent(input.token)}`,
		env.APP_URL,
	);
	const workplaceName = escapeHtml(input.workplaceName);
	const role = input.kind === "manager" ? "manager" : "worker";

	const payload = {
		from: {
			address: env.ZEPTOMAIL_FROM_ADDRESS,
			name: env.ZEPTOMAIL_FROM_NAME,
		},
		to: [{ email_address: { address: input.email, name: input.email } }],
		subject: `You're invited to join ${input.workplaceName}`,
		textbody: `You've been invited to join ${input.workplaceName} as a ${role}. Accept your invitation: ${inviteUrl.toString()}`,
		htmlbody: `<p>You've been invited to join <strong>${workplaceName}</strong> as a ${role}.</p><p><a href="${escapeHtml(inviteUrl.toString())}">Accept invitation</a></p>`,
		track_clicks: true,
		track_opens: true,
		client_reference: `email-delivery:${input.deliveryId}`,
	};
	const endpoint = new URL(
		/^[a-z][a-z\d+.-]*:\/\//i.test(env.ZEPTOMAIL_API_URL)
			? env.ZEPTOMAIL_API_URL
			: `https://${env.ZEPTOMAIL_API_URL}`,
	);
	if (endpoint.protocol !== "https:")
		throw new Error("ZeptoMail requires HTTPS");
	if (!endpoint.pathname.includes("/v1.1/")) endpoint.pathname = "/v1.1/email";
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: env.ZEPTOMAIL_TOKEN,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) throw new Error("ZeptoMail request failed");
	const result = (await response.json()) as { request_id?: unknown };
	if (typeof result?.request_id !== "string") {
		throw new Error("ZeptoMail returned no request ID");
	}
	return { providerMessageId: result.request_id };
}
