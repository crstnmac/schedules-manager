import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";

import { registerMocks, resetState, state } from "@/test/route-harness";

registerMocks();

const joinPageMod = import("../../src/routes/join");
const JoinPage = joinPageMod.then(
	(module) =>
		(module.Route as unknown as { component: ComponentType }).component,
);

const makeInvitation = () => ({
	id: "inv-1",
	token: "tok-1",
	kind: "worker" as const,
	workplaceName: "Acme",
	expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

type AcceptState = {
	isPending: boolean;
	isSuccess: boolean;
	isError: boolean;
	error: Error | null;
	variables?: string;
	mutate: ReturnType<typeof mock>;
};

function makeAccept(overrides: Partial<AcceptState> = {}): AcceptState {
	return {
		isPending: false,
		isSuccess: false,
		isError: false,
		error: null,
		variables: undefined,
		mutate: mock(() => {}),
		...overrides,
	};
}

beforeEach(() => {
	resetState("/join");
	state.auth.isLoading = false;
	state.auth.user = { id: "u1", email: "worker@test" };
	state.me.isLoading = false;
	state.me.data = undefined;
	state.pendingInvitations = {
		data: { invitations: [makeInvitation()] },
		isLoading: false,
	};
	state.acceptInvitation = makeAccept();
});

afterEach(() => {
	cleanup();
});

const renderPage = async () => {
	const Page = await JoinPage;
	return render(<Page />);
};

const acceptButton = (utils: ReturnType<typeof render>) =>
	utils.getByText("Accept").closest("button") as HTMLButtonElement;

describe("JoinPage Accept button", () => {
	test("stays disabled after a successful accept, blocking a re-accept", async () => {
		const accept = makeAccept({ isSuccess: true });
		state.acceptInvitation = accept;
		const utils = await renderPage();
		expect(acceptButton(utils).disabled).toBe(true);
		acceptButton(utils).click();
		expect(accept.mutate).toHaveBeenCalledTimes(0);
	});

	test("does not surface a destructive alert after a successful accept", async () => {
		state.acceptInvitation = makeAccept({ isSuccess: true });
		const utils = await renderPage();
		expect(utils.queryByRole("alert")).toBeNull();
	});

	test("still surfaces genuine errors and allows retry", async () => {
		const accept = makeAccept({
			isError: true,
			error: new Error("Invitation has expired"),
		});
		state.acceptInvitation = accept;
		const utils = await renderPage();
		const alert = utils.queryByRole("alert");
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain("Invitation has expired");
		expect(acceptButton(utils).disabled).toBe(false);
		acceptButton(utils).click();
		expect(accept.mutate).toHaveBeenCalledTimes(1);
	});
});
