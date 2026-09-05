import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";

import { registerMocks, resetState, state } from "@/test/route-harness";

registerMocks();

const workerMod = import("./worker");
const WorkerLayout = workerMod.then(
	(m) => (m.Route as unknown as { component: ComponentType }).component,
);

const workerUser = { id: "w-u1", email: "worker@test" };
const workerWorkplace = { id: "w-w1", name: "Acme" };
const workerMeData = {
	profile: {
		id: "w-u1",
		email: "worker@test",
		fullName: "Worker Person",
		timeFormat: "12h" as const,
		nameFormat: "full" as const,
		notificationPreferences: {
			schedule: true,
			messages: true,
			timeOff: true,
			timeClock: true,
		},
	},
	employments: [
		{ id: "we1", kind: "worker" as const, workplace: workerWorkplace },
	],
};

afterEach(() => {
	cleanup();
});

describe("WorkerLayout auth-loading guard (T12-T17)", () => {
	beforeEach(() => {
		resetState("/worker/timecard");
	});

	test("T12: auth loading renders spinner, no Navigate", async () => {
		const Worker = await WorkerLayout;
		state.auth.isLoading = true;
		state.auth.user = null;
		const { queryByTestId, getByText } = render(<Worker />);
		expect(queryByTestId("navigate")).toBeNull();
		expect(getByText("Loading")).toBeTruthy();
	});

	test("T13: signed out after auth resolves redirects to /", async () => {
		const Worker = await WorkerLayout;
		state.auth.isLoading = false;
		state.auth.user = null;
		const { getByTestId } = render(<Worker />);
		const nav = getByTestId("navigate");
		expect(nav.getAttribute("data-to")).toBe("/");
		expect(nav.getAttribute("data-replace")).toBe("true");
	});

	test("T14: signed in, workplace loading -> workspace spinner, no Navigate", async () => {
		const Worker = await WorkerLayout;
		state.auth.isLoading = false;
		state.auth.user = workerUser;
		state.workplace.isLoading = true;
		state.workplace.workplace = null;
		state.workplace.kind = null;
		const { queryByTestId, getByText } = render(<Worker />);
		expect(queryByTestId("navigate")).toBeNull();
		expect(getByText("Loading")).toBeTruthy();
	});

	test("T15: signed in manager -> Navigate to /dashboard", async () => {
		const Worker = await WorkerLayout;
		state.auth.isLoading = false;
		state.auth.user = workerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = workerWorkplace;
		state.workplace.kind = "manager";
		const { getByTestId } = render(<Worker />);
		expect(getByTestId("navigate").getAttribute("data-to")).toBe("/dashboard");
	});

	test("T16: full data renders layout + Outlet for deep child", async () => {
		const Worker = await WorkerLayout;
		state.auth.isLoading = false;
		state.auth.user = workerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = workerWorkplace;
		state.workplace.kind = "worker";
		state.me.isLoading = false;
		state.me.data = workerMeData;
		const { queryByTestId, getByTestId, queryByText } = render(<Worker />);
		expect(queryByTestId("navigate")).toBeNull();
		expect(getByTestId("outlet")).toBeTruthy();
		expect(queryByText("My schedule")).toBeTruthy();
	});

	test("T17: deep link survives the auth-loading gap (pathname stays /worker/timecard)", async () => {
		const Worker = await WorkerLayout;
		state.auth.isLoading = true;
		state.auth.user = null;
		const r1 = render(<Worker />);
		expect(r1.queryByTestId("navigate")).toBeNull();
		expect(r1.getByText("Loading")).toBeTruthy();
		r1.unmount();

		state.auth.isLoading = false;
		state.auth.user = workerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = workerWorkplace;
		state.workplace.kind = "worker";
		state.me.isLoading = false;
		state.me.data = workerMeData;
		const r2 = render(<Worker />);
		expect(r2.queryByTestId("navigate")).toBeNull();
		expect(r2.getByTestId("outlet")).toBeTruthy();
		expect(state.pathname).toBe("/worker/timecard");
	});
});
