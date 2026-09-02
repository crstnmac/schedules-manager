import { createApp } from "./app";
import { processAutoClockOutBatch } from "./auto-clock-out";
import { processEmailOutboxBatch } from "./email-outbox";
import {
	processNotificationOutboxBatch,
	processPushReceiptBatch,
} from "./notify";

createApp().listen({ port: 3000, hostname: "0.0.0.0" }, () => {
	console.log("Server is running on http://0.0.0.0:3000");
	console.log(
		"OpenAPI documentation is available at http://localhost:3000/openapi",
	);
});

function dispatchNotifications() {
	return Promise.all([
		processNotificationOutboxBatch(),
		processEmailOutboxBatch(),
		processPushReceiptBatch(),
		processAutoClockOutBatch(),
	]).catch((error) => {
		console.error(
			JSON.stringify({
				level: "error",
				message: "Notification outbox dispatcher failed",
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
			}),
		);
	});
}

const outboxTimer = setInterval(() => {
	void dispatchNotifications();
}, 5_000);
outboxTimer.unref();
void dispatchNotifications();
