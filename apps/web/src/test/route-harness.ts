import { mock } from "bun:test";
import { Window } from "happy-dom";
import { createElement, type ReactNode } from "react";

const win = new Window();
for (const key of Object.keys(win)) {
	const value = (win as unknown as Record<string, unknown>)[key];
	if (!(key in globalThis)) {
		(globalThis as unknown as Record<string, unknown>)[key] = value;
	}
}
(globalThis as unknown as Record<string, unknown>).window = win;
(globalThis as unknown as Record<string, unknown>).document = win.document;
(globalThis as unknown as Record<string, unknown>).navigator = win.navigator;

export type AuthState = {
	isLoading: boolean;
	isSigningOut: boolean;
	user: {
		id: string;
		email: string;
	} | null;
	session: unknown;
	signOut: () => Promise<void>;
};

export type WorkplaceState = {
	isLoading: boolean;
	workplace: { id: string; name: string } | null;
	kind: "manager" | "worker" | null;
	employmentId: string | null;
};

export type MeState = {
	isLoading: boolean;
	data:
		| {
				profile: {
					id: string;
					email: string;
					fullName: string | null;
					timeFormat: "12h" | "24h";
					nameFormat: "full" | "first_last_initial" | "first";
					notificationPreferences: Record<string, boolean>;
				};
				employments: {
					id: string;
					kind: "manager" | "worker";
					workplace: { id: string; name: string };
				}[];
		  }
		| undefined;
	isError: boolean;
	error: unknown;
};

export type RouteState = {
	pathname: string;
	auth: AuthState;
	workplace: WorkplaceState;
	me: MeState;
	inbox: { data: { unreadCount: number } | undefined };
	displayPrefs: {
		formatPerson: (fullName: string | null, email: string) => string;
	};
	theme: { setTheme: (t: string) => void };
	posthog: {
		group: () => void;
		register: () => void;
		identify: () => void;
		capture: () => void;
		reset: () => void;
	};
};

const managerUser = { id: "u1", email: "boss@test" };
const managerWorkplace = { id: "w1", name: "Acme" };
const meData: MeState["data"] = {
	profile: {
		id: "u1",
		email: "boss@test",
		fullName: "Boss Person",
		timeFormat: "12h",
		nameFormat: "full",
		notificationPreferences: {
			schedule: true,
			messages: true,
			timeOff: true,
			timeClock: true,
		},
	},
	employments: [{ id: "e1", kind: "manager", workplace: managerWorkplace }],
};

export const state: RouteState = {
	pathname: "/dashboard/schedule",
	auth: {
		isLoading: true,
		isSigningOut: false,
		user: null,
		session: null,
		signOut: async () => {},
	},
	workplace: {
		isLoading: true,
		workplace: null,
		kind: null,
		employmentId: null,
	},
	me: { isLoading: true, data: undefined, isError: false, error: null },
	inbox: { data: { unreadCount: 0 } },
	displayPrefs: {
		formatPerson: (fullName, email) => fullName ?? email,
	},
	theme: { setTheme: () => {} },
	posthog: {
		group: () => {},
		register: () => {},
		identify: () => {},
		capture: () => {},
		reset: () => {},
	},
};

export const defaults = { managerUser, managerWorkplace, meData };

export function resetState(pathname: string) {
	state.pathname = pathname;
	state.auth = {
		isLoading: true,
		isSigningOut: false,
		user: null,
		session: null,
		signOut: async () => {},
	};
	state.workplace = {
		isLoading: true,
		workplace: null,
		kind: null,
		employmentId: null,
	};
	state.me = { isLoading: true, data: undefined, isError: false, error: null };
	state.inbox = { data: { unreadCount: 0 } };
	state.displayPrefs = {
		formatPerson: (fullName, email) => fullName ?? email,
	};
	state.theme = { setTheme: () => {} };
	state.posthog = {
		group: () => {},
		register: () => {},
		identify: () => {},
		capture: () => {},
		reset: () => {},
	};
}

let registered = false;

export function registerMocks() {
	if (registered) return;
	registered = true;

	mock.module("@tanstack/react-router", () => ({
		createFileRoute: () => (options: unknown) => options,
		Navigate: ({ to, replace }: { to: string; replace?: boolean }) =>
			createElement("div", {
				"data-testid": "navigate",
				"data-to": to,
				"data-replace": String(Boolean(replace)),
			}),
		Link: ({
			to,
			children,
			...rest
		}: { to: string; children?: ReactNode } & Record<string, unknown>) =>
			createElement("a", { href: to, ...rest }, children),
		Outlet: () => createElement("div", { "data-testid": "outlet" }),
		useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
			select({ location: { pathname: state.pathname } }),
	}));

	mock.module("@posthog/react", () => ({
		usePostHog: () => state.posthog,
	}));

	mock.module("@/lib/auth", () => ({
		useAuth: () => state.auth,
	}));

	mock.module("@/lib/queries", () => ({
		useMe: () => state.me,
		useNotifications: () => state.inbox,
	}));

	mock.module("@/lib/use-workplace", () => ({
		useWorkplace: () => state.workplace,
	}));

	mock.module("@/lib/use-display-prefs", () => ({
		useDisplayPrefs: () => state.displayPrefs,
	}));

	mock.module("@/components/theme-provider", () => ({
		useTheme: () => state.theme,
		ThemeProvider: ({ children }: { children: ReactNode }) => children,
	}));

	mock.module("@/components/current-profile", () => ({
		profileInitials: () => "BP",
		CurrentProfile: () =>
			createElement("div", { "data-testid": "current-profile" }),
	}));

	mock.module("@/components/logo-mark", () => ({
		LogoMark: () => createElement("div", { "data-testid": "logo-mark" }),
	}));

	mock.module("@/components/pilot-feedback", () => ({
		PilotFeedback: () => null,
	}));

	mock.module("@/components/settings/nav", () => ({
		settingsSectionLabel: () => "Settings",
	}));

	mock.module("@/components/mode-toggle", () => ({
		ModeToggle: () => createElement("div", { "data-testid": "mode-toggle" }),
	}));
}
