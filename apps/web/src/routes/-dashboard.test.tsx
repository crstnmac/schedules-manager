import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";

import {
	defaults,
	registerMocks,
	resetState,
	state,
} from "@/test/route-harness";

registerMocks();

const dashboardMod = import("./dashboard");
const DashboardLayout = dashboardMod.then(
	(m) => (m.Route as unknown as { component: ComponentType }).component,
);

afterEach(() => {
	cleanup();
});

describe("DashboardLayout auth-loading guard (T5-T11)", () => {
	beforeEach(() => {
		resetState("/dashboard/schedule");
	});

	test("T5: auth loading renders spinner, no Navigate", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = true;
		state.auth.user = null;
		const { queryByTestId, getByText } = render(<Dashboard />);
		expect(queryByTestId("navigate")).toBeNull();
		expect(getByText(/Loading/)).toBeTruthy();
	});

	test("T6: signed out after auth resolves redirects to /", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = false;
		state.auth.user = null;
		const { getByTestId } = render(<Dashboard />);
		const nav = getByTestId("navigate");
		expect(nav.getAttribute("data-to")).toBe("/");
		expect(nav.getAttribute("data-replace")).toBe("true");
	});

	test("T7: signed in, workplace loading -> workspace spinner (Loading workspace), no Navigate", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = false;
		state.auth.user = defaults.managerUser;
		state.workplace.isLoading = true;
		state.workplace.workplace = null;
		state.workplace.kind = null;
		const { queryByTestId, getByText } = render(<Dashboard />);
		expect(queryByTestId("navigate")).toBeNull();
		expect(getByText("Loading workspace")).toBeTruthy();
	});

	test("T8: signed in, no workplace -> Navigate to /", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = false;
		state.auth.user = defaults.managerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = null;
		state.workplace.kind = null;
		const { getByTestId } = render(<Dashboard />);
		expect(getByTestId("navigate").getAttribute("data-to")).toBe("/");
	});

	test("T9: signed in worker -> Navigate to /worker", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = false;
		state.auth.user = defaults.managerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = defaults.managerWorkplace;
		state.workplace.kind = "worker";
		const { getByTestId } = render(<Dashboard />);
		expect(getByTestId("navigate").getAttribute("data-to")).toBe("/worker");
	});

	test("T10: full data renders layout + Outlet; useMe enabled once user set", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = false;
		state.auth.user = defaults.managerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = defaults.managerWorkplace;
		state.workplace.kind = "manager";
		state.me.isLoading = false;
		state.me.data = defaults.meData;
		const { queryByTestId, getByTestId, queryByText } = render(<Dashboard />);
		expect(queryByTestId("navigate")).toBeNull();
		expect(getByTestId("outlet")).toBeTruthy();
		expect(queryByText("Overview")).toBeTruthy();
	});

	test("T11: deep link survives the auth-loading gap (pathname stays /dashboard/schedule)", async () => {
		const Dashboard = await DashboardLayout;
		state.auth.isLoading = true;
		state.auth.user = null;
		const r1 = render(<Dashboard />);
		expect(r1.queryByTestId("navigate")).toBeNull();
		expect(r1.getByText(/Loading/)).toBeTruthy();
		r1.unmount();

		state.auth.isLoading = false;
		state.auth.user = defaults.managerUser;
		state.workplace.isLoading = false;
		state.workplace.workplace = defaults.managerWorkplace;
		state.workplace.kind = "manager";
		state.me.isLoading = false;
		state.me.data = defaults.meData;
		const r2 = render(<Dashboard />);
		expect(r2.queryByTestId("navigate")).toBeNull();
		expect(r2.getByTestId("outlet")).toBeTruthy();
		expect(state.pathname).toBe("/dashboard/schedule");
	});
});
