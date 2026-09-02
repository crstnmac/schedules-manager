import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

async function seedWorkplace(
	d: Context["database"],
	name: string,
	weekStartDate = "2026-09-07",
) {
	const managerProfileId = crypto.randomUUID();
	const workerProfileId = crypto.randomUUID();
	const managerEmail = `${name.toLowerCase().replaceAll(" ", "-")}-manager@example.test`;
	const workerEmail = `${name.toLowerCase().replaceAll(" ", "-")}-worker@example.test`;
	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({ name })
		.returning();
	const [location] = await d.db
		.insert(d.locations)
		.values({
			workplaceId: required(workplace).id,
			name: `${name} Floor`,
			timezone: "America/Chicago",
		})
		.returning();
	const [position] = await d.db
		.insert(d.positions)
		.values({
			workplaceId: required(workplace).id,
			name: "Server",
		})
		.returning();
	await d.db.insert(d.profiles).values([
		{ id: managerProfileId, email: managerEmail },
		{ id: workerProfileId, email: workerEmail },
	]);
	const employments = await d.db
		.insert(d.employments)
		.values([
			{
				workplaceId: required(workplace).id,
				profileId: managerProfileId,
				kind: "manager",
			},
			{
				workplaceId: required(workplace).id,
				profileId: workerProfileId,
				kind: "worker",
			},
		])
		.returning();
	const manager = required(
		employments.find((row) => row.profileId === managerProfileId),
	);
	const worker = required(
		employments.find((row) => row.profileId === workerProfileId),
	);
	const [schedule] = await d.db
		.insert(d.schedules)
		.values({
			locationId: required(location).id,
			weekStartDate,
		})
		.returning();
	return {
		workplace: required(workplace),
		location: required(location),
		position: required(position),
		schedule: required(schedule),
		manager,
		worker,
		managerProfileId,
		workerProfileId,
		managerEmail,
		workerEmail,
	};
}

export function registerOpsTests(getContext: () => Context) {
	test("manager can save a named Schedule Template and apply it to another week", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Template Cafe");
		const [draft] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: seed.schedule.id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: new Date("2026-09-08T16:00:00.000Z"),
				endsAt: new Date("2026-09-08T22:00:00.000Z"),
				note: "Patio",
			})
			.returning();
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const save = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07/templates`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
						"idempotency-key": "save-brunch-template",
					},
					body: JSON.stringify({ name: "Brunch" }),
				},
			),
		);
		expect(save.status).toBe(200);
		const saved = (await save.json()) as {
			template: { id: string; name: string; shiftCount: number };
		};
		expect(saved.template.name).toBe("Brunch");
		expect(saved.template.shiftCount).toBe(1);

		const listed = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedule-templates`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(listed.status).toBe(200);
		const listBody = (await listed.json()) as {
			templates: { id: string; name: string }[];
		};
		expect(listBody.templates.map((row) => row.name)).toEqual(["Brunch"]);

		const [target] = await d.db
			.insert(d.schedules)
			.values({
				locationId: seed.location.id,
				weekStartDate: "2026-09-14",
			})
			.returning();
		await d.db.insert(d.shifts).values({
			scheduleId: required(target).id,
			employmentId: null,
			positionId: seed.position.id,
			startsAt: new Date("2026-09-15T12:00:00.000Z"),
			endsAt: new Date("2026-09-15T14:00:00.000Z"),
		});

		const apply = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-14/templates/${saved.template.id}/apply`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"idempotency-key": "apply-brunch-template",
					},
				},
			),
		);
		expect(apply.status).toBe(200);
		expect(await apply.json()).toEqual({ applied: 1 });

		const applied = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.scheduleId, required(target).id));
		expect(applied).toHaveLength(1);
		expect(applied[0]?.employmentId).toBe(seed.worker.id);
		expect(applied[0]?.positionId).toBe(seed.position.id);
		expect(applied[0]?.note).toBe("Patio");
		expect(applied[0]?.startsAt.toISOString()).toBe(
			required(draft)
				.startsAt.toISOString()
				.replace("2026-09-08", "2026-09-15"),
		);
	});

	test("manager can mark attendance on a published Shift without changing it", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Attendance Cafe");
		const [draft] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: seed.schedule.id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: new Date("2026-09-08T16:00:00.000Z"),
				endsAt: new Date("2026-09-08T22:00:00.000Z"),
			})
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: seed.schedule.id, versionNumber: 1 })
			.returning();
		const [snapshot] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draft).id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: required(draft).startsAt,
				endsAt: required(draft).endsAt,
			})
			.returning();
		const managerAccess = await token(seed.managerProfileId, seed.managerEmail);
		const workerAccess = await token(seed.workerProfileId, seed.workerEmail);

		const forbidden = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/version-shifts/${required(snapshot).id}/attendance`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${workerAccess}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ kind: "no_show" }),
				},
			),
		);
		expect(forbidden.status).toBe(403);

		const marked = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/version-shifts/${required(snapshot).id}/attendance`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerAccess}`,
						"content-type": "application/json",
						"idempotency-key": "mark-no-show",
					},
					body: JSON.stringify({ kind: "no_show" }),
				},
			),
		);
		expect(marked.status).toBe(200);
		expect(await marked.json()).toEqual({
			attendance: { kind: "no_show", note: null },
		});

		const updated = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/version-shifts/${required(snapshot).id}/attendance`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerAccess}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ kind: "late", note: "Came in at 11:20" }),
				},
			),
		);
		expect(updated.status).toBe(200);
		expect(await updated.json()).toEqual({
			attendance: { kind: "late", note: "Came in at 11:20" },
		});

		const marks = await d.db
			.select()
			.from(d.attendanceMarks)
			.where(eq(d.attendanceMarks.versionShiftId, required(snapshot).id));
		expect(marks).toHaveLength(1);
		expect(marks[0]?.kind).toBe("late");

		const payload = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07`,
				{ headers: { authorization: `Bearer ${managerAccess}` } },
			),
		);
		expect(payload.status).toBe(200);
		const body = (await payload.json()) as {
			timeclock: { shiftId: string; attendance: string | null }[];
		};
		expect(
			body.timeclock.find((row) => row.shiftId === required(draft).id)
				?.attendance,
		).toBe("late");
		expect(required(draft).startsAt.toISOString()).toBe(
			"2026-09-08T16:00:00.000Z",
		);
	});

	test("manager can create and correct a Time Entry with a reason", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Timesheet Cafe");
		const [draft] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: seed.schedule.id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: new Date("2026-09-08T16:00:00.000Z"),
				endsAt: new Date("2026-09-08T22:00:00.000Z"),
			})
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: seed.schedule.id, versionNumber: 1 })
			.returning();
		const [snapshot] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draft).id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: required(draft).startsAt,
				endsAt: required(draft).endsAt,
			})
			.returning();
		const managerAccess = await token(seed.managerProfileId, seed.managerEmail);
		const workerAccess = await token(seed.workerProfileId, seed.workerEmail);
		const put = (auth: string, body: unknown, key?: string) =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${seed.workplace.id}/version-shifts/${required(snapshot).id}/time-entry`,
					{
						method: "PUT",
						headers: {
							authorization: `Bearer ${auth}`,
							"content-type": "application/json",
							...(key ? { "idempotency-key": key } : {}),
						},
						body: JSON.stringify(body),
					},
				),
			);

		expect(
			(
				await put(workerAccess, {
					clockedInAt: "2026-09-08T16:05:00.000Z",
					clockedOutAt: "2026-09-08T22:10:00.000Z",
					reason: "Missed punch",
				})
			).status,
		).toBe(403);
		expect(
			(
				await put(managerAccess, {
					clockedInAt: "2026-09-08T16:05:00.000Z",
					clockedOutAt: "2026-09-08T22:10:00.000Z",
					reason: "  no",
				})
			).status,
		).toBe(400);
		expect(
			(
				await put(managerAccess, {
					clockedInAt: "2026-09-08T22:10:00.000Z",
					clockedOutAt: "2026-09-08T16:05:00.000Z",
					reason: "Missed punch",
				})
			).status,
		).toBe(400);

		const created = await put(
			managerAccess,
			{
				clockedInAt: "2026-09-08T16:05:00.000Z",
				clockedOutAt: "2026-09-08T22:10:00.000Z",
				reason: "Forgot to clock out",
			},
			"record-missed-punch",
		);
		expect(created.status).toBe(200);
		const createdBody = (await created.json()) as {
			timeEntry: { clockedInAt: string; clockedOutAt: string | null };
		};
		expect(createdBody.timeEntry.clockedInAt).toBe("2026-09-08T16:05:00.000Z");
		expect(createdBody.timeEntry.clockedOutAt).toBe("2026-09-08T22:10:00.000Z");

		const stillOpen = await put(managerAccess, {
			clockedInAt: "2026-09-08T16:12:00.000Z",
			clockedOutAt: null,
			reason: "Still on the floor",
		});
		expect(stillOpen.status).toBe(200);
		expect(await stillOpen.json()).toMatchObject({
			timeEntry: {
				clockedInAt: "2026-09-08T16:12:00.000Z",
				clockedOutAt: null,
			},
		});

		const entries = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.versionShiftId, required(snapshot).id));
		expect(entries).toHaveLength(1);
		expect(entries[0]?.editReason).toBe("Still on the floor");
		expect(entries[0]?.editedByProfileId).toBe(seed.managerProfileId);
		expect(entries[0]?.editedAt).not.toBeNull();

		const audits = await d.db
			.select()
			.from(d.auditEvents)
			.where(eq(d.auditEvents.workplaceId, seed.workplace.id));
		expect(audits.some((row) => row.action === "time_entry.edited")).toBe(true);
	});

	test("auto-assign fills unassigned draft Shifts from eligible Workers", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Assign Cafe");
		await d.db.insert(d.shifts).values({
			scheduleId: seed.schedule.id,
			employmentId: null,
			positionId: seed.position.id,
			startsAt: new Date("2026-09-08T16:00:00.000Z"),
			endsAt: new Date("2026-09-08T22:00:00.000Z"),
		});
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07/auto-assign`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${access}` },
				},
			),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ assigned: 1 });
		const [shift] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.scheduleId, seed.schedule.id));
		expect(shift?.employmentId).toBe(seed.worker.id);
	});

	test("calendar month lists Shifts without creating extra Schedules", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Calendar Cafe");
		await d.db.insert(d.shifts).values({
			scheduleId: seed.schedule.id,
			employmentId: seed.worker.id,
			positionId: seed.position.id,
			startsAt: new Date("2026-09-08T16:00:00.000Z"),
			endsAt: new Date("2026-09-08T22:00:00.000Z"),
		});
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const before = await d.db
			.select({ id: d.schedules.id })
			.from(d.schedules)
			.where(eq(d.schedules.locationId, seed.location.id));
		const response = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/calendar/2026-09-01`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			shifts: { positionName: string; date: string }[];
		};
		expect(body.shifts).toHaveLength(1);
		expect(body.shifts[0]?.positionName).toBe("Server");
		const after = await d.db
			.select({ id: d.schedules.id })
			.from(d.schedules)
			.where(eq(d.schedules.locationId, seed.location.id));
		expect(after).toHaveLength(before.length);
	});

	test("approving Time-off deducts PTO Balance minutes for that Leave Type", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "PTO Cafe");
		const managerAccess = await token(seed.managerProfileId, seed.managerEmail);
		const workerAccess = await token(seed.workerProfileId, seed.workerEmail);
		const leave = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/leave-types`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerAccess}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ name: "Vacation", paid: true }),
				},
			),
		);
		expect(leave.status).toBe(200);
		const leaveBody = (await leave.json()) as { leaveType: { id: string } };
		const pto = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/employments/${seed.worker.id}/pto`,
				{
					method: "PUT",
					headers: {
						authorization: `Bearer ${managerAccess}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						leaveTypeId: leaveBody.leaveType.id,
						minutes: 480,
					}),
				},
			),
		);
		expect(pto.status).toBe(200);
		const request = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/my/time-off`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${workerAccess}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						startsAt: "2026-09-10T15:00:00.000Z",
						endsAt: "2026-09-10T19:00:00.000Z",
						leaveTypeId: leaveBody.leaveType.id,
					}),
				},
			),
		);
		expect(request.status).toBe(200);
		const requested = (await request.json()) as { request: { id: string } };
		const decided = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/time-off/${requested.request.id}/decision`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerAccess}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ decision: "approved" }),
				},
			),
		);
		expect(decided.status).toBe(200);
		const balances = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/employments/${seed.worker.id}/pto`,
				{ headers: { authorization: `Bearer ${managerAccess}` } },
			),
		);
		expect(await balances.json()).toMatchObject({
			balances: [{ minutes: 240, name: "Vacation" }],
		});
	});

	test("bulk delete removes selected draft Shifts", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Bulk Cafe");
		const created = await d.db
			.insert(d.shifts)
			.values([
				{
					scheduleId: seed.schedule.id,
					employmentId: seed.worker.id,
					positionId: seed.position.id,
					startsAt: new Date("2026-09-08T16:00:00.000Z"),
					endsAt: new Date("2026-09-08T20:00:00.000Z"),
				},
				{
					scheduleId: seed.schedule.id,
					employmentId: seed.worker.id,
					positionId: seed.position.id,
					startsAt: new Date("2026-09-09T16:00:00.000Z"),
					endsAt: new Date("2026-09-09T20:00:00.000Z"),
				},
			])
			.returning();
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07/bulk`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						shiftIds: created.map((row) => row.id),
						delete: true,
					}),
				},
			),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ updated: 2 });
		const remaining = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.scheduleId, seed.schedule.id));
		expect(remaining).toHaveLength(0);
	});

	test("manager can approve a completed Time Entry", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Sheet Cafe");
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: seed.schedule.id, versionNumber: 1 })
			.returning();
		const [snapshot] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: new Date("2026-09-08T16:00:00.000Z"),
				endsAt: new Date("2026-09-08T22:00:00.000Z"),
			})
			.returning();
		const [entry] = await d.db
			.insert(d.timeEntries)
			.values({
				versionShiftId: required(snapshot).id,
				employmentId: seed.worker.id,
				clockedInAt: new Date("2026-09-08T16:05:00.000Z"),
				clockedOutAt: new Date("2026-09-08T22:00:00.000Z"),
			})
			.returning();
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/time-entries/${required(entry).id}/approval`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ decision: "approved" }),
				},
			),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			timeEntry: { approvalStatus: "approved" },
		});
	});

	test("kiosk PIN clock rejects a bad Location PIN and a missing Shift", async () => {
		const { database: d, app } = getContext();
		const { hashPin } = await import("../../src/pin");
		const seed = await seedWorkplace(d, "Kiosk Cafe");
		await d.db
			.update(d.locations)
			.set({ kioskPinHash: hashPin("2468") })
			.where(eq(d.locations.id, seed.location.id));
		await d.db
			.update(d.employments)
			.set({ kioskPinHash: hashPin("1357") })
			.where(eq(d.employments.id, seed.worker.id));
		const badPin = await app.handle(
			new Request("http://localhost/v1/kiosk/clock", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					locationId: seed.location.id,
					locationPin: "0000",
					workerPin: "1357",
					action: "in",
				}),
			}),
		);
		expect(badPin.status).toBe(400);
		const missingShift = await app.handle(
			new Request("http://localhost/v1/kiosk/clock", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					locationId: seed.location.id,
					locationPin: "2468",
					workerPin: "1357",
					action: "in",
				}),
			}),
		);
		expect(missingShift.status).toBe(404);
	});

	test("Time Block and Shift Template can be stored for a Location", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Block Cafe");
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const block = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/time-blocks`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						name: "Dinner",
						startMinute: 1020,
						endMinute: 1320,
					}),
				},
			),
		);
		expect(block.status).toBe(200);
		const template = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/shift-templates`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						name: "Closer",
						positionId: seed.position.id,
						startMinute: 1020,
						endMinute: 1320,
					}),
				},
			),
		);
		expect(template.status).toBe(200);
		const listed = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/time-blocks`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(listed.status).toBe(200);
		expect(await listed.json()).toMatchObject({
			timeBlocks: [{ name: "Dinner", startMinute: 1020 }],
			shiftTemplates: [{ name: "Closer", positionId: seed.position.id }],
		});
	});

	test("Geofence rejects a clock-in without coordinates", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Geo Cafe");
		await d.db
			.update(d.locations)
			.set({
				latitude: "30.2672",
				longitude: "-97.7431",
				geofenceRadiusMeters: 100,
			})
			.where(eq(d.locations.id, seed.location.id));
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: seed.schedule.id, versionNumber: 1 })
			.returning();
		const now = Date.now();
		const [snapshot] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt: new Date(now - 10 * 60_000),
				endsAt: new Date(now + 90 * 60_000),
			})
			.returning();
		const access = await token(seed.workerProfileId, seed.workerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/my/shifts/${required(snapshot).id}/clock-in`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({}),
				},
			),
		);
		expect(response.status).toBe(400);
	});

	test("assigning an unapproved position is rejected until the manager approves it", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedWorkplace(d, "Position Scope Cafe");
		const [host] = await d.db
			.insert(d.positions)
			.values({
				workplaceId: seed.workplace.id,
				name: "Host",
			})
			.returning();
		await d.db.insert(d.employmentPositions).values({
			employmentId: seed.worker.id,
			positionId: seed.position.id,
		});
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const blocked = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07/shifts`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						employmentId: seed.worker.id,
						positionId: required(host).id,
						date: "2026-09-08",
						startMinute: 540,
						endMinute: 1020,
					}),
				},
			),
		);
		expect(blocked.status).toBe(400);
		const blockedBody = (await blocked.json()) as { message: string };
		expect(blockedBody.message).toBe("Worker is not approved for this position");

		const created = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07/shifts`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						employmentId: seed.worker.id,
						positionId: required(host).id,
						date: "2026-09-08",
						startMinute: 540,
						endMinute: 1020,
						approvePosition: true,
					}),
				},
			),
		);
		expect(created.status).toBe(200);
		const createdBody = (await created.json()) as { shiftId: string };
		const scope = await d.db
			.select({ positionId: d.employmentPositions.positionId })
			.from(d.employmentPositions)
			.where(eq(d.employmentPositions.employmentId, seed.worker.id));
		expect(scope.map((row) => row.positionId).sort()).toEqual(
			[seed.position.id, required(host).id].sort(),
		);

		const [bar] = await d.db
			.insert(d.positions)
			.values({
				workplaceId: seed.workplace.id,
				name: "Bar",
			})
			.returning();
		const moved = await app.handle(
			new Request(`http://localhost/v1/shifts/${createdBody.shiftId}`, {
				method: "PATCH",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					positionId: required(bar).id,
					approvePosition: true,
				}),
			}),
		);
		expect(moved.status).toBe(200);
		const afterMove = await d.db
			.select({ positionId: d.employmentPositions.positionId })
			.from(d.employmentPositions)
			.where(eq(d.employmentPositions.employmentId, seed.worker.id));
		expect(afterMove.map((row) => row.positionId).sort()).toEqual(
			[seed.position.id, required(host).id, required(bar).id].sort(),
		);
	});
}
