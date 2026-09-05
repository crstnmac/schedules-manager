import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Window } from "happy-dom";
import type { ReactNode } from "react";

// Self-contained DOM environment for this route-component test.
// The web app ships no DOM test harness by default; this file installs
// happy-dom globals before any tests run. `render()` reads `document` at
// call time (not at import), so installing the globals in the module body
// is sufficient. We deliberately avoid the global `screen` helper, which
// binds to `document.body` at @testing-library/dom import time.
const win = new Window();
(globalThis as Record<string, unknown>).window = win;
(globalThis as Record<string, unknown>).document = win.document;
(globalThis as Record<string, unknown>).navigator = win.navigator;
(globalThis as Record<string, unknown>).HTMLElement = win.HTMLElement;
(globalThis as Record<string, unknown>).Node = win.Node;
(globalThis as Record<string, unknown>).Element = win.Element;
(globalThis as Record<string, unknown>).Event = win.Event;
(globalThis as Record<string, unknown>).CustomEvent = win.CustomEvent;
(globalThis as Record<string, unknown>).MutationObserver = win.MutationObserver;
(globalThis as Record<string, unknown>).requestAnimationFrame = (
	cb: FrameRequestCallback,
) => setTimeout(() => cb(performance.now()), 0);
(globalThis as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
	clearTimeout(id);

type ChildrenProps = { children?: ReactNode };
type ButtonProps = ChildrenProps & {
	disabled?: boolean;
	onClick?: () => void;
	type?: "button" | "submit" | "reset";
};

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
	mutate: ReturnType<typeof mock>;
};

function makeAccept(state: Partial<AcceptState> = {}): AcceptState {
	return {
		isPending: false,
		isSuccess: false,
		isError: false,
		error: null,
		mutate: mock(() => {}),
		...state,
	};
}

let meData: { profile: object | null; employments: object[] } | undefined;
let meLoading = false;
let pendingData: { invitations: object[] } | undefined;
let pendingLoading = false;
let acceptState: AcceptState = makeAccept();
let authUser: object | null = { id: "u1" };

mock.module("@/lib/queries", () => ({
	useMe: () => ({
		data: meData,
		isLoading: meLoading,
	}),
	usePendingInvitations: () => ({
		data: pendingData,
		isLoading: pendingLoading,
	}),
	useAcceptInvitation: () => acceptState,
}));

mock.module("@/lib/auth", () => ({
	useAuth: () => ({ user: authUser, signOut: () => {} }),
}));

mock.module("@/lib/home-path", () => ({
	homePath: () => "/worker",
}));

mock.module("@posthog/react", () => ({
	usePostHog: () => ({ capture: () => {} }),
}));

// `createFileRoute("/join")({ component: JoinPage })` captures the route
// options; the test pulls the un-exported `JoinPage` back out via `Route.component`.
mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: (props?: object) => ReactNode }) =>
		opts,
	Navigate: ({ to }: { to: string }) => (
		<span data-testid="navigate" data-to={to} />
	),
}));

mock.module("@SchedulesManager/ui/components/alert", () => ({
	Alert: ({ children }: { children: ReactNode }) => (
		<div role="alert">{children}</div>
	),
	AlertDescription: ({ children }: { children: ReactNode }) => (
		<span>{children}</span>
	),
}));

mock.module("@/components/auth-shell", () => ({
	AuthShell: ({ children }: { children: ReactNode }) => (
		<div data-testid="auth-shell">{children}</div>
	),
}));

mock.module("@/components/current-profile", () => ({
	CurrentProfile: () => <div data-testid="current-profile" />,
}));

mock.module("@SchedulesManager/ui/components/spinner", () => ({
	Spinner: () => <span data-icon="inline-start">spinning</span>,
}));

mock.module("@SchedulesManager/ui/components/button", () => ({
	Button: (props: ButtonProps) => (
		<button
			{...props}
			disabled={props.disabled}
			onClick={props.disabled ? undefined : props.onClick}
			type={props.type ?? "button"}
		/>
	),
}));

mock.module("@SchedulesManager/ui/components/card", () => ({
	Card: ({ children }: ChildrenProps) => <div>{children}</div>,
	CardHeader: ({ children }: ChildrenProps) => <div>{children}</div>,
	CardTitle: ({ children }: ChildrenProps) => <div>{children}</div>,
	CardDescription: ({ children }: ChildrenProps) => <div>{children}</div>,
	CardContent: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

mock.module("@SchedulesManager/ui/components/item", () => ({
	Item: ({ children }: ChildrenProps) => <li>{children}</li>,
	ItemContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemTitle: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemDescription: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemActions: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemGroup: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

type JoinPageComponent = (props?: object) => ReactNode;
let joinPageMod: typeof import("../../src/routes/join");
let joinPage: JoinPageComponent;
const renderPage = async () => {
	if (!joinPageMod) {
		joinPageMod = await import("../../src/routes/join");
		joinPage = (
			joinPageMod.Route as unknown as { component: JoinPageComponent }
		).component;
	}
	const Page = joinPage;
	return render(<Page />);
};

beforeEach(() => {
	meData = { profile: null, employments: [] };
	meLoading = false;
	pendingData = { invitations: [makeInvitation()] };
	pendingLoading = false;
	acceptState = makeAccept();
	authUser = { id: "u1" };
});

afterEach(() => {
	cleanup();
});

const acceptBtn = (utils: ReturnType<typeof render>) =>
	utils.getByText("Accept").closest("button") as HTMLButtonElement;

describe("JoinPage Accept button", () => {
	test("stays disabled after a successful accept, blocking a re-accept", async () => {
		acceptState = makeAccept({ isSuccess: true });
		const utils = await renderPage();
		expect(acceptBtn(utils).disabled).toBe(true);
		acceptBtn(utils).click();
		expect(acceptState.mutate).toHaveBeenCalledTimes(0);
	});

	test("does not surface a destructive alert after a successful accept", async () => {
		acceptState = makeAccept({ isSuccess: true });
		const utils = await renderPage();
		expect(utils.queryByRole("alert")).toBeNull();
	});

	test("still surfaces genuine errors and allows retry", async () => {
		acceptState = makeAccept({
			isError: true,
			error: new Error("Invitation has expired"),
		});
		const utils = await renderPage();
		const alert = utils.queryByRole("alert");
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain("Invitation has expired");
		expect(acceptBtn(utils).disabled).toBe(false);
		acceptBtn(utils).click();
		expect(acceptState.mutate).toHaveBeenCalledTimes(1);
	});
});
