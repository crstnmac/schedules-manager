import { describe, expect, mock, test } from "bun:test";

import { createShiftNotificationCoordinator } from "./shift-notification-sync";

type Item = { id: string };

type Gate = { promise: Promise<void>; resolve: () => void };

function gate(): Gate {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function ids(invoked: Item[][]): string[] {
	return invoked.map((arr) =>
		arr
			.map((s) => s.id)
			.sort()
			.join(","),
	);
}

const shift = (id: string) => ({ id });

function makeRunner() {
	const invoked: Item[][] = [];
	const gates: Gate[] = [];
	async function run(shifts: Item[]) {
		invoked.push(shifts);
		const g = gate();
		gates.push(g);
		await g.promise;
	}
	return { run, invoked, gates };
}

describe("createShiftNotificationCoordinator", () => {
	test("applies the first schedule when idle", async () => {
		const r = makeRunner();
		const c = createShiftNotificationCoordinator<Item>(r.run);
		const a = [shift("a")];
		c.submit(a, "k1");
		expect(ids(r.invoked)).toEqual(["a"]);
		expect(r.gates.length).toBe(1);
		r.gates[0].resolve();
		await flush();
		expect(ids(r.invoked)).toEqual(["a"]);
		expect(r.gates.length).toBe(1);
	});

	test("applies a newer schedule that arrived while an earlier sync was in flight", async () => {
		const r = makeRunner();
		const c = createShiftNotificationCoordinator<Item>(r.run);

		c.submit([shift("a")], "k1");
		expect(ids(r.invoked)).toEqual(["a"]);

		c.submit([shift("b")], "k2");
		expect(ids(r.invoked)).toEqual(["a"]);
		expect(r.gates.length).toBe(1);

		r.gates[0].resolve();
		await flush();
		expect(ids(r.invoked)).toEqual(["a", "b"]);

		r.gates[1].resolve();
		await flush();
		expect(r.gates.length).toBe(2);
	});

	test("the latest pending schedule wins when several arrive mid-sync", async () => {
		const r = makeRunner();
		const c = createShiftNotificationCoordinator<Item>(r.run);

		c.submit([shift("a")], "k1");
		c.submit([shift("b")], "k2");
		c.submit([shift("c")], "k3");

		expect(ids(r.invoked)).toEqual(["a"]);
		expect(r.gates.length).toBe(1);

		r.gates[0].resolve();
		await flush();
		expect(ids(r.invoked)).toEqual(["a", "c"]);

		r.gates[1].resolve();
		await flush();
		expect(r.gates.length).toBe(2);
	});

	test("does not re-run for a syncKey that matches the last applied one", async () => {
		const r = makeRunner();
		const c = createShiftNotificationCoordinator<Item>(r.run);

		c.submit([shift("a")], "k1");
		r.gates[0].resolve();
		await flush();

		c.submit([shift("a")], "k1");
		expect(r.invoked.length).toBe(1);
	});

	test("does not start a redundant re-sync when a same-key schedule arrives mid-sync", async () => {
		const r = makeRunner();
		const c = createShiftNotificationCoordinator<Item>(r.run);

		c.submit([shift("a")], "k1");
		c.submit([shift("x")], "k1");

		r.gates[0].resolve();
		await flush();

		expect(ids(r.invoked)).toEqual(["a"]);
		expect(r.gates.length).toBe(1);
	});

	test("a failed sync does not advance lastSyncKey and still retries the pending newer schedule", async () => {
		const originalWarn = console.warn;
		const warn = mock(() => {});
		console.warn = warn as typeof console.warn;

		const invoked: Item[][] = [];
		const gates: Gate[] = [];
		let firstCall = true;
		async function run(shifts: Item[]) {
			invoked.push(shifts);
			const g = gate();
			gates.push(g);
			await g.promise;
			if (firstCall) {
				firstCall = false;
				throw new Error("boom");
			}
		}

		try {
			const c = createShiftNotificationCoordinator<Item>(run);

			c.submit([shift("a")], "k1");
			c.submit([shift("b")], "k2");

			gates[0].resolve();
			await flush();
			expect(ids(invoked)).toEqual(["a", "b"]);

			gates[1].resolve();
			await flush();

			c.submit([shift("a")], "k1");
			expect(ids(invoked)).toEqual(["a", "b", "a"]);

			gates[2].resolve();
			await flush();

			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			console.warn = originalWarn;
		}
	});

	test("keeps re-syncing for schedules that arrive during follow-up syncs", async () => {
		const r = makeRunner();
		const c = createShiftNotificationCoordinator<Item>(r.run);

		c.submit([shift("a")], "k1");
		c.submit([shift("b")], "k2");
		c.submit([shift("c")], "k3");

		r.gates[0].resolve();
		await flush();
		expect(ids(r.invoked)).toEqual(["a", "c"]);

		c.submit([shift("d")], "k4");
		expect(ids(r.invoked)).toEqual(["a", "c"]);

		r.gates[1].resolve();
		await flush();
		expect(ids(r.invoked)).toEqual(["a", "c", "d"]);

		r.gates[2].resolve();
		await flush();
		expect(r.gates.length).toBe(3);
	});
});
