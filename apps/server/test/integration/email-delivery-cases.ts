import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";

export const emailWebhookTestSecret =
	"integration-webhook-secret-not-production";
type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (id: string, email: string) => Promise<string>;
};

export function registerEmailDeliveryTests(getContext: () => Context) {
	test("email outbox retries durably, tracks signed provider outcomes, and scopes manager reports", async () => {
		const { database, app, token } = getContext();
		const {
			db,
			emailDeliveries,
			invitations,
			profiles,
			workplaces,
			employments,
		} = database;
		const { enqueueInvitationEmail, processEmailOutboxBatch } = await import(
			"../../src/email-outbox"
		);
		const managerId = crypto.randomUUID();
		await db
			.insert(profiles)
			.values({ id: managerId, email: "email-manager@example.test" });
		const [workplace] = await db
			.insert(workplaces)
			.values({ name: "Email delivery test" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		await db.insert(employments).values({
			workplaceId: workplace.id,
			profileId: managerId,
			kind: "manager",
		});
		const [invitation] = await db.transaction(async (tx) => {
			const created = await tx
				.insert(invitations)
				.values({
					workplaceId: workplace.id,
					invitedBy: managerId,
					email: "email-recipient@example.test",
					kind: "worker",
					expiresAt: new Date(Date.now() + 86_400_000),
				})
				.returning();
			if (!created[0]) throw new Error("Missing invitation");
			await enqueueInvitationEmail(tx, created[0]);
			return created;
		});
		if (!invitation) throw new Error("Missing invitation");
		const read = async () =>
			(
				await db
					.select()
					.from(emailDeliveries)
					.where(eq(emailDeliveries.invitationId, invitation.id))
			)[0];
		expect((await read())?.status).toBe("queued");
		await processEmailOutboxBatch(10, async () => {
			throw new Error("simulated provider failure with sensitive content");
		});
		const retry = await read();
		expect(retry?.status).toBe("queued");
		expect(retry?.attempts).toBe(1);
		expect(retry?.availableAt.getTime()).toBeGreaterThan(Date.now());
		expect(retry?.lastError).not.toContain("sensitive");
		await db
			.update(emailDeliveries)
			.set({ availableAt: new Date(0) })
			.where(eq(emailDeliveries.invitationId, invitation.id));
		await processEmailOutboxBatch(10, async () => ({
			providerMessageId: "zepto-test-message",
		}));
		const sent = await read();
		expect(sent?.status).toBe("sent");
		expect(sent?.providerMessageId).toBe("zepto-test-message");
		expect(sent?.attempts).toBe(2);
		const webhook = async (
			eventName: string,
			eventId: string,
			valid = true,
		) => {
			const payload = JSON.stringify({
				webhook_request_id: eventId,
				event_name: [eventName],
				event_message: [
					{
						request_id: "zepto-test-message",
						email_info: { client_reference: `email-delivery:${sent?.id}` },
					},
				],
			});
			const digest = createHmac(
				"sha256",
				valid ? emailWebhookTestSecret : "wrong-secret",
			)
				.update(payload)
				.digest("base64");
			return app.handle(
				new Request("http://localhost/v1/webhooks/zeptomail", {
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						"producer-signature": `ts=${Date.now()};s=${encodeURIComponent(digest)};s-algorithm=HmacSHA256`,
					},
					body: new URLSearchParams({ data: payload }).toString(),
				}),
			);
		};
		expect(
			(await webhook("delivered", "email-event-forged", false)).status,
		).toBe(401);
		expect((await read())?.status).toBe("sent");
		expect(
			(await webhook("softbounce", "email-event-soft-bounced")).status,
		).toBe(200);
		expect((await read())?.status).toBe("bounced");
		expect((await webhook("delivered", "email-event-delivered")).status).toBe(
			200,
		);
		expect((await read())?.status).toBe("delivered");
		expect((await webhook("delivered", "email-event-delivered")).status).toBe(
			200,
		);
		expect((await webhook("hardbounce", "email-event-bounced")).status).toBe(
			200,
		);
		expect((await read())?.status).toBe("bounced");
		expect(
			(await webhook("delivered", "email-event-late-delivered")).status,
		).toBe(200);
		expect((await read())?.status).toBe("bounced");
		const authorization = `Bearer ${await token(managerId, "email-manager@example.test")}`;
		const report = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplace.id}/email-deliveries`,
				{ headers: { authorization } },
			),
		);
		expect(report.status).toBe(200);
		const body = await report.json();
		expect(body.deliveries).toHaveLength(1);
		expect(body.deliveries[0].token).toBeUndefined();
		const forbidden = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${crypto.randomUUID()}/email-deliveries`,
				{ headers: { authorization } },
			),
		);
		expect(forbidden.status).toBe(403);
	});

	test("invitation and queued mail roll back together, stale mail is cancelled, exhausted retries fail", async () => {
		const { database } = getContext();
		const { db, invitations, emailDeliveries, workplaces, profiles } = database;
		const { enqueueInvitationEmail, processEmailOutboxBatch } = await import(
			"../../src/email-outbox"
		);
		const profileId = crypto.randomUUID();
		await db
			.insert(profiles)
			.values({ id: profileId, email: "email-rollback@example.test" });
		const [workplace] = await db
			.insert(workplaces)
			.values({ name: "Email rollback" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		try {
			await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(invitations)
					.values({
						workplaceId: workplace.id,
						email: "rollback@example.test",
						invitedBy: profileId,
						kind: "worker",
						expiresAt: new Date(Date.now() + 86_400_000),
					})
					.returning();
				if (!created) throw new Error("Missing invitation");
				await enqueueInvitationEmail(tx, created);
				throw new Error("forced rollback");
			});
		} catch (error) {
			expect((error as Error).message).toBe("forced rollback");
		}
		expect(
			await db
				.select()
				.from(invitations)
				.where(eq(invitations.workplaceId, workplace.id)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(emailDeliveries)
				.where(eq(emailDeliveries.workplaceId, workplace.id)),
		).toHaveLength(0);
		const [created] = await db
			.insert(invitations)
			.values({
				workplaceId: workplace.id,
				email: "cancelled@example.test",
				invitedBy: profileId,
				kind: "worker",
				expiresAt: new Date(Date.now() + 86_400_000),
			})
			.returning();
		if (!created) throw new Error("Missing invitation");
		await db.transaction((tx) => enqueueInvitationEmail(tx, created));
		await db
			.update(invitations)
			.set({ status: "revoked" })
			.where(eq(invitations.id, created.id));
		let calls = 0;
		await processEmailOutboxBatch(10, async () => {
			calls++;
			return { providerMessageId: "must-not-send" };
		});
		expect(calls).toBe(0);
		const [cancelled] = await db
			.select()
			.from(emailDeliveries)
			.where(eq(emailDeliveries.invitationId, created.id));
		expect(cancelled?.status).toBe("cancelled");
		await db
			.update(invitations)
			.set({ status: "pending" })
			.where(eq(invitations.id, created.id));
		await db
			.update(emailDeliveries)
			.set({ status: "queued", attempts: 7 })
			.where(eq(emailDeliveries.invitationId, created.id));
		await processEmailOutboxBatch(10, async () => {
			throw new Error("provider down");
		});
		const [failed] = await db
			.select()
			.from(emailDeliveries)
			.where(eq(emailDeliveries.invitationId, created.id));
		expect(failed?.status).toBe("failed");
		expect(failed?.attempts).toBe(8);
	});
}
