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

async function authJson(
	app: Context["app"],
	path: string,
	access: string,
	init: { method?: string; body?: unknown } = {},
) {
	return app.handle(
		new Request(`http://localhost${path}`, {
			method: init.method ?? "GET",
			headers: {
				authorization: `Bearer ${access}`,
				...(init.body === undefined
					? {}
					: { "content-type": "application/json" }),
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
		}),
	);
}

async function seedLeaveWorkplace(
	d: Context["database"],
	name: string,
	options: { wageCents?: number } = {},
) {
	const suffix = name.toLowerCase().replaceAll(" ", "-");
	const managerA = {
		profileId: crypto.randomUUID(),
		email: `${suffix}-a@example.test`,
	};
	const managerB = {
		profileId: crypto.randomUUID(),
		email: `${suffix}-b@example.test`,
	};
	const worker = {
		profileId: crypto.randomUUID(),
		email: `${suffix}-w@example.test`,
	};
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
	await d.db.insert(d.profiles).values([
		{ id: managerA.profileId, email: managerA.email, fullName: "Manager A" },
		{ id: managerB.profileId, email: managerB.email, fullName: "Manager B" },
		{ id: worker.profileId, email: worker.email, fullName: "Worker One" },
	]);
	const employments = await d.db
		.insert(d.employments)
		.values([
			{
				workplaceId: required(workplace).id,
				profileId: managerA.profileId,
				kind: "manager",
			},
			{
				workplaceId: required(workplace).id,
				profileId: managerB.profileId,
				kind: "manager",
			},
			{
				workplaceId: required(workplace).id,
				profileId: worker.profileId,
				kind: "worker",
				hourlyWageCents: options.wageCents ?? null,
			},
		])
		.returning();
	return {
		workplace: required(workplace),
		location: required(location),
		managerA: {
			...managerA,
			employment: required(
				employments.find((row) => row.profileId === managerA.profileId),
			),
		},
		managerB: {
			...managerB,
			employment: required(
				employments.find((row) => row.profileId === managerB.profileId),
			),
		},
		worker: {
			...worker,
			employment: required(
				employments.find((row) => row.profileId === worker.profileId),
			),
		},
	};
}

async function createLeaveType(
	app: Context["app"],
	seed: Awaited<ReturnType<typeof seedLeaveWorkplace>>,
	access: string,
	body: { name: string; paid?: boolean; code?: string },
) {
	const response = await authJson(
		app,
		`/v1/workplaces/${seed.workplace.id}/leave-types`,
		access,
		{
			method: "POST",
			body: { name: body.name, paid: body.paid ?? true, code: body.code },
		},
	);
	expect(response.status).toBe(200);
	return (await response.json()) as { leaveType: { id: string; name: string } };
}

async function setBalance(
	app: Context["app"],
	seed: Awaited<ReturnType<typeof seedLeaveWorkplace>>,
	access: string,
	leaveTypeId: string,
	minutes: number,
) {
	const response = await authJson(
		app,
		`/v1/workplaces/${seed.workplace.id}/employments/${seed.worker.employment.id}/pto`,
		access,
		{ method: "PUT", body: { leaveTypeId, minutes } },
	);
	expect(response.status).toBe(200);
}

async function balanceFor(
	app: Context["app"],
	seed: Awaited<ReturnType<typeof seedLeaveWorkplace>>,
	access: string,
	leaveTypeId: string,
) {
	const response = await authJson(
		app,
		`/v1/workplaces/${seed.workplace.id}/employments/${seed.worker.employment.id}/pto`,
		access,
	);
	expect(response.status).toBe(200);
	const body = (await response.json()) as {
		balances: { leaveTypeId: string; minutes: number }[];
	};
	return (
		body.balances.find((balance) => balance.leaveTypeId === leaveTypeId)
			?.minutes ?? 0
	);
}

export function registerLeaveTests(getContext: () => Context) {
	test("multi-level approval chain, delegation, and balance deduction", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave Approvals");
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const managerBAccess = await token(
			seed.managerB.profileId,
			seed.managerB.email,
		);
		const workerAccess = await token(seed.worker.profileId, seed.worker.email);

		const type = await createLeaveType(app, seed, managerAccess, {
			name: "Vacation",
		});
		await setBalance(app, seed, managerAccess, type.leaveType.id, 480);

		const chainResponse = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-approval-chains`,
			managerAccess,
			{
				method: "POST",
				body: {
					name: "Two step",
					steps: [
						{
							approverKind: "specific_employment",
							approverEmploymentId: seed.managerB.employment.id,
						},
						{ approverKind: "workplace_managers" },
					],
				},
			},
		);
		expect(chainResponse.status).toBe(200);
		const chain = (await chainResponse.json()) as { chain: { id: string } };

		const assign = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-types/${type.leaveType.id}`,
			managerAccess,
			{ method: "PATCH", body: { approvalChainId: chain.chain.id } },
		);
		expect(assign.status).toBe(200);

		const request = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/my/time-off`,
			workerAccess,
			{
				method: "POST",
				body: {
					startDate: "2026-09-14",
					endDate: "2026-09-14",
					allDay: true,
					leaveTypeId: type.leaveType.id,
				},
			},
		);
		expect(request.status).toBe(200);
		const requestBody = (await request.json()) as {
			request: { id: string; chargeMinutes: number };
		};
		expect(requestBody.request.chargeMinutes).toBe(480);

		const boardA = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off`,
			managerAccess,
		);
		const boardABody = (await boardA.json()) as {
			requests: {
				id: string;
				canDecide: boolean;
				approvals: { stepOrder: number; status: string }[];
			}[];
		};
		const asA = boardABody.requests.find(
			(row) => row.id === requestBody.request.id,
		);
		expect(asA?.canDecide).toBe(false);
		expect(asA?.approvals.map((step) => step.status)).toEqual([
			"pending",
			"pending",
		]);

		const boardB = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off`,
			managerBAccess,
		);
		const boardBBody = (await boardB.json()) as {
			requests: { id: string; canDecide: boolean }[];
		};
		expect(
			boardBBody.requests.find((row) => row.id === requestBody.request.id)
				?.canDecide,
		).toBe(true);

		// Manager B delegates to the worker, who can then act on step 0.
		const delegation = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-delegations`,
			managerBAccess,
			{
				method: "POST",
				body: {
					delegateEmploymentId: seed.worker.employment.id,
					startsAt: new Date(Date.now() - 3_600_000).toISOString(),
					endsAt: new Date(Date.now() + 86_400_000).toISOString(),
					reason: "Conference",
				},
			},
		);
		expect(delegation.status).toBe(200);

		const delegatedDecision = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/${requestBody.request.id}/decision`,
			workerAccess,
			{ method: "POST", body: { decision: "approved" } },
		);
		expect(delegatedDecision.status).toBe(200);
		const delegatedBody = (await delegatedDecision.json()) as {
			request: { status: string };
			via: string;
		};
		expect(delegatedBody.request.status).toBe("pending");
		expect(delegatedBody.via).toBe("delegation");

		const finalDecision = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/${requestBody.request.id}/decision`,
			managerAccess,
			{ method: "POST", body: { decision: "approved" } },
		);
		expect(finalDecision.status).toBe(200);
		expect(
			((await finalDecision.json()) as { request: { status: string } }).request
				.status,
		).toBe("approved");
		expect(await balanceFor(app, seed, managerAccess, type.leaveType.id)).toBe(
			0,
		);
	});

	test("emergency expedite skips remaining steps and records the override", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave Emergency");
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const workerAccess = await token(seed.worker.profileId, seed.worker.email);
		const type = await createLeaveType(app, seed, managerAccess, {
			name: "Sick",
		});
		const chain = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-approval-chains`,
			managerAccess,
			{
				method: "POST",
				body: {
					name: "Escalating",
					steps: [
						{
							approverKind: "specific_employment",
							approverEmploymentId: seed.managerB.employment.id,
						},
						{
							approverKind: "specific_employment",
							approverEmploymentId: seed.managerA.employment.id,
						},
					],
				},
			},
		);
		const chainBody = (await chain.json()) as { chain: { id: string } };
		await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-types/${type.leaveType.id}`,
			managerAccess,
			{ method: "PATCH", body: { approvalChainId: chainBody.chain.id } },
		);
		const request = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/my/time-off`,
			workerAccess,
			{
				method: "POST",
				body: {
					startDate: "2026-09-15",
					endDate: "2026-09-15",
					allDay: true,
					leaveTypeId: type.leaveType.id,
					isEmergency: true,
				},
			},
		);
		const requestBody = (await request.json()) as { request: { id: string } };
		const expedite = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/${requestBody.request.id}/expedite`,
			managerAccess,
			{ method: "POST", body: { reason: "Hospital" } },
		);
		expect(expedite.status).toBe(200);
		const board = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off`,
			managerAccess,
		);
		const boardBody = (await board.json()) as {
			requests: {
				id: string;
				status: string;
				decisionReason: string | null;
				approvals: { status: string; decisionReason: string | null }[];
			}[];
		};
		const row = required(
			boardBody.requests.find((item) => item.id === requestBody.request.id),
		);
		expect(row.status).toBe("approved");
		expect(row.decisionReason).toBe("Emergency: Hospital");
		expect(row.approvals.every((step) => step.status === "skipped")).toBe(true);
	});

	test("accrual run credits balances and is idempotent", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave Accrual");
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const type = await createLeaveType(app, seed, managerAccess, {
			name: "Vacation",
		});
		const policy = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-types/${type.leaveType.id}/policy`,
			managerAccess,
			{
				method: "PUT",
				body: {
					accrualMethod: "monthly",
					accrualMinutes: 960,
					accrualDay: 1,
					prorateOnJoin: false,
				},
			},
		);
		expect(policy.status).toBe(200);
		await d.db
			.update(d.employments)
			.set({ joinedAt: "2026-01-01" })
			.where(eq(d.employments.id, seed.worker.employment.id));
		const run = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-accruals/run`,
			managerAccess,
			{ method: "POST", body: { asOf: "2026-04-15" } },
		);
		expect(run.status).toBe(200);
		const runBody = (await run.json()) as {
			accruals: { creditedEntries: number };
		};
		expect(runBody.accruals.creditedEntries).toBeGreaterThanOrEqual(3);
		const first = await balanceFor(app, seed, managerAccess, type.leaveType.id);
		expect(first).toBeGreaterThanOrEqual(2880);
		const again = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-accruals/run`,
			managerAccess,
			{ method: "POST", body: { asOf: "2026-04-15" } },
		);
		const againBody = (await again.json()) as {
			accruals: { creditedEntries: number };
		};
		expect(againBody.accruals.creditedEntries).toBe(0);
		expect(await balanceFor(app, seed, managerAccess, type.leaveType.id)).toBe(
			first,
		);
		const ledger = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-ledger?employmentId=${seed.worker.employment.id}&kind=accrual&limit=100`,
			managerAccess,
		);
		const ledgerBody = (await ledger.json()) as { entries: unknown[] };
		expect(ledgerBody.entries.length).toBeGreaterThanOrEqual(3);
	});

	test("encashment, transfer, and adjustment move balances correctly", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave Money", {
			wageCents: 2000,
		});
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const workerAccess = await token(seed.worker.profileId, seed.worker.email);
		const vacation = await createLeaveType(app, seed, managerAccess, {
			name: "Vacation",
		});
		const personal = await createLeaveType(app, seed, managerAccess, {
			name: "Personal",
		});
		await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-types/${vacation.leaveType.id}/policy`,
			managerAccess,
			{ method: "PUT", body: { encashmentEnabled: true } },
		);
		await setBalance(app, seed, managerAccess, vacation.leaveType.id, 960);
		await setBalance(app, seed, managerAccess, personal.leaveType.id, 0);

		const encashResponse = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/my/leave-encashments`,
			workerAccess,
			{
				method: "POST",
				body: { leaveTypeId: vacation.leaveType.id, minutes: 480 },
			},
		);
		expect(encashResponse.status).toBe(200);
		const encashment = (await encashResponse.json()) as {
			encashment: { id: string; amountCents: number };
		};
		expect(encashment.encashment.amountCents).toBe(16_000);
		const decision = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-encashments/${encashment.encashment.id}/decision`,
			managerAccess,
			{ method: "POST", body: { decision: "approved" } },
		);
		expect(decision.status).toBe(200);
		expect(
			await balanceFor(app, seed, managerAccess, vacation.leaveType.id),
		).toBe(480);

		const transfer = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-transfers`,
			managerAccess,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.employment.id,
					fromLeaveTypeId: vacation.leaveType.id,
					toLeaveTypeId: personal.leaveType.id,
					minutes: 240,
					reason: "Use it or lose it",
				},
			},
		);
		expect(transfer.status).toBe(200);
		expect(
			await balanceFor(app, seed, managerAccess, vacation.leaveType.id),
		).toBe(240);
		expect(
			await balanceFor(app, seed, managerAccess, personal.leaveType.id),
		).toBe(240);

		const overdraft = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-transfers`,
			managerAccess,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.employment.id,
					fromLeaveTypeId: vacation.leaveType.id,
					toLeaveTypeId: personal.leaveType.id,
					minutes: 10_000,
				},
			},
		);
		expect(overdraft.status).toBe(400);

		const adjustment = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-adjustments`,
			managerAccess,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.employment.id,
					leaveTypeId: vacation.leaveType.id,
					minutes: -60,
					note: "Correction",
				},
			},
		);
		expect(adjustment.status).toBe(200);
		expect(
			await balanceFor(app, seed, managerAccess, vacation.leaveType.id),
		).toBe(180);

		const payroll = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/reports/leave?from=2026-01-01&to=2026-12-31`,
			managerAccess,
		);
		expect(payroll.status).toBe(200);
		const payrollCsv = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/reports/leave-payroll.csv?from=2026-01-01&to=2026-12-31`,
			managerAccess,
		);
		expect(payrollCsv.headers.get("content-type")).toContain("text/csv");
	});

	test("batch requests, calendar feed, and document uploads", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave Extras");
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const workerAccess = await token(seed.worker.profileId, seed.worker.email);

		const batch = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/my/time-off/batch`,
			workerAccess,
			{
				method: "POST",
				body: {
					windows: [
						{ startDate: "2026-09-14", endDate: "2026-09-14", allDay: true },
					],
					recurrence: { frequency: "weekly", count: 3 },
					isEmergency: false,
				},
			},
		);
		expect(batch.status).toBe(200);
		const batchBody = (await batch.json()) as {
			batchId: string;
			requests: { id: string }[];
		};
		expect(batchBody.requests).toHaveLength(3);

		const approved = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/bulk-decision`,
			managerAccess,
			{
				method: "POST",
				body: {
					requestIds: batchBody.requests.map((row) => row.id),
					decision: "approved",
				},
			},
		);
		expect(approved.status).toBe(200);
		const approvedBody = (await approved.json()) as { approved: number };
		expect(approvedBody.approved).toBe(3);

		const tokenResponse = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/my/calendar-token`,
			workerAccess,
			{ method: "POST" },
		);
		expect(tokenResponse.status).toBe(200);
		const calendarToken = (await tokenResponse.json()) as {
			token: { url: string };
		};
		const feed = await app.handle(
			new Request(`http://localhost${calendarToken.token.url}`),
		);
		expect(feed.status).toBe(200);
		expect(feed.headers.get("content-type")).toContain("text/calendar");
		const feedBody = await feed.text();
		expect(feedBody).toContain("BEGIN:VCALENDAR");
		expect(feedBody).toContain("VALUE=DATE");

		// Documents upload returns metadata and is visible to the worker.
		const form = new FormData();
		form.set(
			"file",
			new File([new TextEncoder().encode("%PDF-1.4 test")], "note.pdf", {
				type: "application/pdf",
			}),
		);
		const upload = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/time-off/${batchBody.requests[0]?.id}/documents`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${workerAccess}` },
					body: form,
				},
			),
		);
		expect(upload.status).toBe(200);
		const uploadBody = (await upload.json()) as {
			document: { id: string; fileName: string; sizeBytes: number };
		};
		expect(uploadBody.document.fileName).toBe("note.pdf");
		const constraints = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/my/constraints`,
			workerAccess,
		);
		const constraintsBody = (await constraints.json()) as {
			timeOff: { id: string; documents: { id: string }[] }[];
		};
		const requestRow = required(
			constraintsBody.timeOff.find(
				(row) => row.id === batchBody.requests[0]?.id,
			),
		);
		expect(requestRow.documents).toHaveLength(1);

		const download = await app.handle(
			new Request(
				`http://localhost/v1/leave-documents/${uploadBody.document.id}`,
				{ headers: { authorization: `Bearer ${managerAccess}` } },
			),
		);
		expect(download.status).toBe(200);
	});

	test("CSV import previews, commits, and reports row errors", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave CSV");
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const type = await createLeaveType(app, seed, managerAccess, {
			name: "Vacation",
			code: "VAC",
		});
		await setBalance(app, seed, managerAccess, type.leaveType.id, 960);

		const csv = [
			"worker_email,leave_type,start_date,end_date,all_day,reason,status",
			`${seed.worker.email},VAC,2026-09-14,2026-09-14,true,Imported approved,approved`,
			`${seed.worker.email},Vacation,2026-09-21,2026-09-21,true,Imported pending,pending`,
			"nobody@example.com,Vacation,2026-09-14,2026-09-14,true,Unknown worker,approved",
			`${seed.worker.email},Vacation,bad-date,,true,Bad date,approved`,
		].join("\n");

		const preview = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/import`,
			managerAccess,
			{ method: "POST", body: { csv, dryRun: true } },
		);
		expect(preview.status).toBe(200);
		const previewBody = (await preview.json()) as {
			import: {
				dryRun: boolean;
				imported: number;
				failed: { line: number; message: string }[];
				entries: { chargeMinutes: number; status: string }[];
			};
		};
		expect(previewBody.import.dryRun).toBe(true);
		expect(previewBody.import.imported).toBe(2);
		expect(previewBody.import.entries.map((entry) => entry.status)).toEqual([
			"approved",
			"pending",
		]);
		expect(previewBody.import.entries[0]?.chargeMinutes).toBe(480);
		expect(previewBody.import.failed.map((failure) => failure.line)).toEqual([
			4, 5,
		]);

		// A dry run writes nothing.
		expect(
			await balanceFor(app, seed, managerAccess, type.leaveType.id),
		).toBe(960);
		const before = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off`,
			managerAccess,
		);
		expect(
			((await before.json()) as { requests: unknown[] }).requests,
		).toHaveLength(0);

		const commit = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/import`,
			managerAccess,
			{ method: "POST", body: { csv } },
		);
		expect(commit.status).toBe(200);
		const commitBody = (await commit.json()) as {
			import: { imported: number; failed: unknown[] };
		};
		expect(commitBody.import.imported).toBe(2);
		expect(commitBody.import.failed).toHaveLength(2);
		expect(
			await balanceFor(app, seed, managerAccess, type.leaveType.id),
		).toBe(480);

		const listed = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off`,
			managerAccess,
		);
		const listedBody = (await listed.json()) as {
			requests: { status: string; approvals: unknown[]; chargeMinutes: number }[];
		};
		expect(listedBody.requests).toHaveLength(2);
		const pending = listedBody.requests.find(
			(request) => request.status === "pending",
		);
		expect(pending?.approvals).toHaveLength(1);

		const template = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/time-off/import/template.csv`,
			managerAccess,
		);
		expect(template.status).toBe(200);
		expect(template.headers.get("content-type")).toContain("text/csv");
		expect(await template.text()).toContain("worker_email,leave_type");
	});

	test("CSV balance import sets and adds balances", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedLeaveWorkplace(d, "Leave CSV Balances");
		const managerAccess = await token(
			seed.managerA.profileId,
			seed.managerA.email,
		);
		const type = await createLeaveType(app, seed, managerAccess, {
			name: "Vacation",
			code: "VAC",
		});

		const setCsv = [
			"worker_email,leave_type,hours,minutes,mode,effective_date,note",
			`${seed.worker.email},VAC,40,,set,2026-01-01,Opening balance`,
		].join("\n");

		const preview = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-balances/import`,
			managerAccess,
			{ method: "POST", body: { csv: setCsv, dryRun: true } },
		);
		expect(preview.status).toBe(200);
		expect(
			((await preview.json()) as { import: { imported: number } }).import
				.imported,
		).toBe(1);
		expect(
			await balanceFor(app, seed, managerAccess, type.leaveType.id),
		).toBe(0);

		const commit = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-balances/import`,
			managerAccess,
			{ method: "POST", body: { csv: setCsv } },
		);
		expect(commit.status).toBe(200);
		expect(
			await balanceFor(app, seed, managerAccess, type.leaveType.id),
		).toBe(2400);

		// Re-importing the same set leaves the balance untouched.
		await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-balances/import`,
			managerAccess,
			{ method: "POST", body: { csv: setCsv } },
		);
		expect(
			await balanceFor(app, seed, managerAccess, type.leaveType.id),
		).toBe(2400);

		const addCsv = [
			"worker_email,leave_type,hours,mode,effective_date",
			`${seed.worker.email},VAC,-8,add,2026-02-01`,
		].join("\n");
		const add = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-balances/import`,
			managerAccess,
			{ method: "POST", body: { csv: addCsv } },
		);
		expect(add.status).toBe(200);
		expect(
			await balanceFor(app, seed, managerAccess, type.leaveType.id),
		).toBe(1920);

		const badCsv = [
			"worker_email,leave_type,hours",
			"ghost@example.com,VAC,8",
			`${seed.worker.email},Unknown,8`,
		].join("\n");
		const bad = await authJson(
			app,
			`/v1/workplaces/${seed.workplace.id}/leave-balances/import`,
			managerAccess,
			{ method: "POST", body: { csv: badCsv } },
		);
		const badBody = (await bad.json()) as {
			import: { imported: number; failed: { line: number }[] };
		};
		expect(badBody.import.imported).toBe(0);
		expect(badBody.import.failed.map((failure) => failure.line)).toEqual([2, 3]);
	});
}
