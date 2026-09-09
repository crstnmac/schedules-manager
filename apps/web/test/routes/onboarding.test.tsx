import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Window } from "happy-dom";
import type { ReactNode } from "react";

// Self-contained DOM environment for this route-component test, mirroring
// the harness in join.test.tsx (the sibling regression test for the disable
// -after-success contract). The web app ships no DOM test harness by
// default; this file installs happy-dom globals before any tests run.
// `render()` reads `document` at call time (not at import), so installing
// the globals in the module body is sufficient. We deliberately avoid the
// global `screen` helper, which binds to `document.body` at @testing-library/
// dom import time.
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
	form?: string;
};
type ItemProps = ChildrenProps & {
	onClick?: () => void;
	render?: ReactNode;
	variant?: string;
};
type InputProps = {
	id?: string;
	value?: string;
	onChange?: (event: { target: { value: string } }) => void;
	placeholder?: string;
};

// Valid v4-shaped UUID accepted by `invitationTokenFromInput` in onboarding.tsx.
const VALID_TOKEN = "a1b2c3d4-e5f6-1234-8abc-123456789abc";

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
let pendingFetching = false;
let pendingRefetch: ReturnType<typeof mock>;
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
		isFetching: pendingFetching,
		refetch: pendingRefetch,
	}),
	useAcceptInvitation: () => acceptState,
}));

mock.module("@/lib/auth", () => ({
	useAuth: () => ({ user: authUser, signOut: () => {} }),
}));

mock.module("@posthog/react", () => ({
	usePostHog: () => ({ capture: () => {} }),
}));

// `@tanstack/react-query` is intentionally NOT mocked: `onboarding.tsx`
// imports `useMutation`/`useQueryClient` from it for `WorkplaceSetup`, which
// this suite never renders (only the worker → `WaitingForInvite` path runs,
// and `useAcceptInvitation`/`useMe`/`usePendingInvitations` come from the
// mocked `@/lib/queries`). Mocking it partially would shadow `QueryClient`
// etc. for every other test file in a `bun test` run (`mock.module` is
// process-global), so leave the real module intact.

// `createFileRoute("/onboarding")({ component: OnboardingComponent })`
// captures the route options; the test pulls the un-exported
// `OnboardingComponent` back out via `Route.component`.
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

mock.module("@/components/address-search", () => ({
	AddressSearch: () => <div data-testid="address-search" />,
}));

mock.module("@/components/timezone-select", () => ({
	TimezoneSelect: () => <div data-testid="timezone-select" />,
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
	CardFooter: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

mock.module("@SchedulesManager/ui/components/item", () => ({
	// The real `Item` renders the `render` prop as its root element so the
	// `onClick` (e.g. `onChoose("worker")`) lands on a real button. Mirror
	// that just enough to make the choice card clickable in tests.
	Item: ({ children, onClick, render }: ItemProps) => {
		if (render && onClick) {
			return (
				<li>
					<button type="button" onClick={onClick}>
						{children}
					</button>
				</li>
			);
		}
		return <li>{children}</li>;
	},
	// Export the remaining real `item.tsx` names (ItemActions, ItemFooter,
	// ItemHeader, ItemSeparator) as inert placeholders so this mock is a
	// drop-in for the whole module — `bun test` shares `mock.module`
	// registrations across files in a run, and the sibling `join.test.tsx`
	// imports `ItemActions`.
	ItemActions: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemTitle: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemDescription: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemMedia: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemGroup: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemFooter: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemHeader: ({ children }: ChildrenProps) => <div>{children}</div>,
	ItemSeparator: () => null,
}));

mock.module("@SchedulesManager/ui/components/field", () => ({
	Field: ({ children }: ChildrenProps) => <div>{children}</div>,
	FieldDescription: ({ children }: ChildrenProps) => <span>{children}</span>,
	FieldGroup: ({ children }: ChildrenProps) => <div>{children}</div>,
	FieldLabel: ({ children, htmlFor }: ChildrenProps & { htmlFor?: string }) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

mock.module("@SchedulesManager/ui/components/input", () => ({
	Input: (props: InputProps) => (
		<input
			id={props.id}
			value={props.value ?? ""}
			onChange={props.onChange}
			placeholder={props.placeholder}
		/>
	),
}));

mock.module("lucide-react", () => ({
	StoreIcon: () => <span data-testid="store-icon" />,
	UsersIcon: () => <span data-testid="users-icon" />,
}));

mock.module("sonner", () => ({
	toast: { success: () => {}, error: () => {}, message: () => {} },
}));

mock.module("@/lib/api", () => ({
	api: () => Promise.resolve({}),
}));

type OnboardingComponent = (props?: object) => ReactNode;
let onboardingMod: typeof import("../../src/routes/onboarding");
let onboardingPage: OnboardingComponent;
const renderPage = async () => {
	if (!onboardingMod) {
		onboardingMod = await import("../../src/routes/onboarding");
		onboardingPage = (
			onboardingMod.Route as unknown as { component: OnboardingComponent }
		).component;
	}
	const Page = onboardingPage;
	return render(<Page />);
};

beforeEach(() => {
	meData = { profile: null, employments: [] };
	meLoading = false;
	pendingData = { invitations: [] };
	pendingLoading = false;
	pendingFetching = false;
	pendingRefetch = mock(() => Promise.resolve({ data: pendingData }));
	acceptState = makeAccept();
	authUser = { id: "u1" };
});

afterEach(() => {
	cleanup();
});

// Drive `OnboardingComponent` through the "I'm a team member" choice into the
// `WaitingForInvite` paste-link screen (the component-under-test for this
// regression). The onboarding screen only renders `WaitingForInvite` after the
// worker chooses the "team member" path, with no employments and no pending
// invitations.
const renderWaitingForInvite = async (
	user: Awaited<ReturnType<typeof userEvent.setup>>,
) => {
	const utils = await renderPage();
	// `onboarding.tsx` renders the choice label as `I'm a team member`;
	// match by regex so the apostrophe style (curly vs. straight) is irrelevant.
	const choiceBtn = utils
		.getByText(/I.m a team member/)
		.closest("button") as HTMLButtonElement;
	await user.click(choiceBtn);
	return utils;
};

const joinBtn = (utils: ReturnType<typeof render>) =>
	utils.getByText("Join workplace").closest("button") as HTMLButtonElement;

const inviteForm = (utils: ReturnType<typeof render>) =>
	utils.container.querySelector("#join-invite-form") as HTMLFormElement;

// `userEvent`'s defaults read `globalThis.document` at module-import time,
// before this file installs happy-dom globals, so it captures `undefined`.
// Pass our happy-dom `document` explicitly so the session wires up. The cast
// bridges happy-dom's `Document` and lib.dom's `Document` (structurally
// compatible at runtime; the properties userEvent touches all line up).
const setupUser = () =>
	userEvent.setup({ document: win.document as unknown as Document });

// Type a valid invite token into the paste-link input so `token` becomes
// truthy and the `!token` branch of the disabled expression no longer holds.
// `userEvent.type` dispatches real keyboard events with proper value
// tracking, which reliably drives React's controlled-input `onChange`.
const enterValidToken = async (
	user: Awaited<ReturnType<typeof userEvent.setup>>,
	utils: ReturnType<typeof render>,
) => {
	const input = utils.getByPlaceholderText("Paste invitation link or code");
	await user.type(input, VALID_TOKEN);
};

describe("WaitingForInvite Join workplace button", () => {
	test("stays disabled after a successful accept, blocking a re-accept", async () => {
		const user = setupUser();
		acceptState = makeAccept({ isSuccess: true });
		const utils = await renderWaitingForInvite(user);
		await enterValidToken(user, utils);
		expect(joinBtn(utils).disabled).toBe(true);
		joinBtn(utils).click();
		expect(acceptState.mutate).toHaveBeenCalledTimes(0);
	});

	test("does not surface a destructive alert after a successful accept", async () => {
		const user = setupUser();
		acceptState = makeAccept({ isSuccess: true });
		const utils = await renderWaitingForInvite(user);
		await enterValidToken(user, utils);
		expect(utils.queryByRole("alert")).toBeNull();
	});

	test("still surfaces genuine errors and allows retry", async () => {
		const user = setupUser();
		acceptState = makeAccept({
			isError: true,
			error: new Error("Invitation is no longer pending"),
		});
		const utils = await renderWaitingForInvite(user);
		await enterValidToken(user, utils);
		const alert = utils.queryByRole("alert");
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain("Invitation is no longer pending");
		expect(joinBtn(utils).disabled).toBe(false);
		fireEvent.submit(inviteForm(utils));
		expect(acceptState.mutate).toHaveBeenCalledTimes(1);
	});

	test("is disabled until a valid invite token is entered", async () => {
		const user = setupUser();
		acceptState = makeAccept();
		const utils = await renderWaitingForInvite(user);
		expect(joinBtn(utils).disabled).toBe(true);
		await enterValidToken(user, utils);
		expect(joinBtn(utils).disabled).toBe(false);
	});

	test("is disabled while an accept is pending and shows in-flight copy", async () => {
		const user = setupUser();
		acceptState = makeAccept({ isPending: true });
		const utils = await renderWaitingForInvite(user);
		await enterValidToken(user, utils);
		const pendingBtn = utils
			.getByText("Joining…")
			.closest("button") as HTMLButtonElement;
		expect(pendingBtn.disabled).toBe(true);
		expect(acceptState.mutate).toHaveBeenCalledTimes(0);
	});
});
