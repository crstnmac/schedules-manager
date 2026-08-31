import { env } from "@SchedulesManager/env/server";
import { SendMailClient } from "zeptomail";

const client = new SendMailClient({
	url: env.ZEPTOMAIL_API_URL,
	token: env.ZEPTOMAIL_TOKEN,
});

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
}) {
	const inviteUrl = new URL(
		`/invite/${encodeURIComponent(input.token)}`,
		env.APP_URL,
	);
	const workplaceName = escapeHtml(input.workplaceName);
	const role = input.kind === "manager" ? "manager" : "worker";

	await client.sendMail({
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
		client_reference: `invitation:${input.token}`,
	});
}
