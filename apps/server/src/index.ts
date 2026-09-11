import { createApp } from "./app";
import { processAutoClockOutBatch } from "./auto-clock-out";
import { processEmailOutboxBatch } from "./email-outbox";
import { runLeaveAccruals, runLeaveCarryForward } from "./leave-accrual";
import { escalateOverdueLeaveApprovals } from "./leave-approvals";
import {
	processNotificationOutboxBatch,
	processPushReceiptBatch,
} from "./notify";
import { dispatchWebhookDeliveries } from "./webhooks";

createApp().listen({ port: 3000, hostname: "0.0.0.0" }, () => {
	console.log("Server is running on http://0.0.0.0:3000");
	console.log(
		"OpenAPI documentation is available at http://localhost:3000/openapi",
	);
});

let dispatchInFlight = false;
let lastLeaveAccrualRun = 0;

/**
 * Leave automation: escalations run on every tick; accruals, carry-forward and
 * expiry run at most hourly. Both are idempotent, so a missed tick is safe.
 */
async function processLeaveAutomation() {
	await escalateOverdueLeaveApprovals();
	if (Date.now() - lastLeaveAccrualRun < 60 * 60_000) return;
	lastLeaveAccrualRun = Date.now();
	await runLeaveCarryForward({});
	await runLeaveAccruals({});
}

async function dispatchNotifications() {
	if (dispatchInFlight) return;
	dispatchInFlight = true;
	try {
		const results = await Promise.allSettled([
			processNotificationOutboxBatch(),
			processEmailOutboxBatch(),
			processPushReceiptBatch(),
			processAutoClockOutBatch(),
			dispatchWebhookDeliveries(),
			processLeaveAutomation(),
		]);
		for (const result of results) {
			if (result.status === "rejected") {
				console.error(
					JSON.stringify({
						level: "error",
						message: "Notification outbox dispatcher failed",
						error:
							result.reason instanceof Error
								? result.reason.message
								: String(result.reason),
						timestamp: new Date().toISOString(),
					}),
				);
			}
		}
	} finally {
		dispatchInFlight = false;
	}
}

const outboxTimer = setInterval(() => {
	void dispatchNotifications();
}, 5_000);
outboxTimer.unref();
void dispatchNotifications();
