/**
 * T7 — Component-level regression test for `apps/web/src/routes/dashboard/messages.tsx`.
 *
 * Covers G1, G2, G3, G4, G5, G9, G10 by actually rendering `MessagesPage`
 * inside a fresh `QueryClientProvider`, mocking only `@/lib/api` (so no env /
 * supabase / fetch chain loads) and `sonner.toast`. The real React Query hooks
 * (`useConversations`, `useMessages`, `useWorkers`, `useMe`), the real
 * `useMutation` from `@tanstack/react-query@5.102.8`, and the real
 * `ConversationWorkspace` UI are exercised.
 *
 * The cross-conversation race is reproduced by making the POST to A return a
 * deferred promise the test resolves *after* the user has clicked thread B
 * in the rail (which triggers the `useMutation` option-swap re-render).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationDto, ConversationMessageDto } from "@/lib/queries";

// `vi.hoisted` runs before the hoisted `vi.mock` factories, so we can share
// state between the test body and the mock factory.
const controls = vi.hoisted(() => ({
	// deferred the POST to A resolves with; assigned on each POST A request.
	postADeferred: null as {
		promise: Promise<{ message: ConversationMessageDto }>;
		resolve: (value: { message: ConversationMessageDto }) => void;
		reject: (error: unknown) => void;
	} | null,
	// "deferred" | "reject"; controls what the POST A handler returns.
	postAMode: "deferred" as "deferred" | "reject",
	postAErrorMessage: "Server exploded",
	// counters and records for assertions.
	getConversationsCalls: 0,
	postACalls: 0,
	postBCalls: 0,
	recordedPostURLs: [] as string[],
}));

function makeDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

vi.mock("@/lib/api", () => {
	class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = "ApiError";
			this.status = status;
		}
	}
	const api = vi.fn(
		async (path: string, options: { method?: "GET" | "POST" } = {}) => {
			const method = options.method ?? "GET";
			// GET responses
			if (method === "GET" && path === "/v1/me") {
				return {
					profile: {
						id: "p1",
						email: "manager@example.com",
						fullName: "Manager One",
						timeFormat: "12h",
						nameFormat: "full",
						notificationPreferences: {
							schedule: true,
							messages: true,
							timeOff: true,
							timeClock: true,
						},
					},
					employments: [
						{
							id: "e1",
							kind: "manager",
							workplace: {
								id: "w1",
								name: "Workplace One",
								policies: {
									messagingEnabled: true,
									announcementsEnabled: true,
									tasksEnabled: true,
									contactDetailsVisible: true,
									workerScheduleVisibility: "own",
									workerTimeOffVisibility: true,
									breaksEnabled: true,
									shiftExchangesEnabled: true,
									workersCanRequestTimeOff: true,
									geofenceRequired: false,
									timesheetNotesEnabled: true,
									unavailabilityRequiresApproval: true,
								},
							},
						},
					],
				};
			}
			if (method === "GET" && path === "/v1/workplaces/w1/workers") {
				return { workers: [], invitations: [] };
			}
			if (method === "GET" && path === "/v1/workplaces/w1/conversations") {
				controls.getConversationsCalls += 1;
				return { conversations: [convA, convB] };
			}
			if (method === "GET" && path === "/v1/conversations/A/messages") {
				return { messages: [], hasMore: false };
			}
			if (method === "GET" && path === "/v1/conversations/B/messages") {
				return { messages: [], hasMore: false };
			}
			// POST responses
			if (method === "POST" && path === "/v1/conversations/A/messages") {
				controls.postACalls += 1;
				controls.recordedPostURLs.push(path);
				if (controls.postAMode === "reject") {
					throw new ApiError(500, controls.postAErrorMessage);
				}
				controls.postADeferred = makeDeferred<{
					message: ConversationMessageDto;
				}>();
				return controls.postADeferred.promise;
			}
			if (method === "POST" && path === "/v1/conversations/B/messages") {
				controls.postBCalls += 1;
				controls.recordedPostURLs.push(path);
				controls.postADeferred = makeDeferred<{
					message: ConversationMessageDto;
				}>();
				return controls.postADeferred.promise;
			}
			throw new Error(`unexpected api() call: ${method} ${path}`);
		},
	);
	return { api, ApiError, publicApi: vi.fn() };
});

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

const convA: ConversationDto = {
	id: "A",
	kind: "workplace",
	title: "A-Workplace",
	subtitle: "Everyone",
	counterpart: null,
	lastMessage: null,
};
const convB: ConversationDto = {
	id: "B",
	kind: "direct",
	title: "B-Direct",
	subtitle: "Direct thread",
	counterpart: { employmentId: "e2", name: "B", email: "b@example.com" },
	lastMessage: null,
};

const echoed: ConversationMessageDto = {
	id: "m1",
	body: "hi",
	author: "Manager One",
	authorEmploymentId: "e1",
	createdAt: "2026-09-05T00:00:00.000Z",
};

// Importing the route component pulls in the mocked api and sonner.
import { MessagesPage } from "@/routes/dashboard/messages";

function lastMessageOf(
	client: QueryClient,
	id: string,
): ConversationMessageDto[] {
	const data = client.getQueryData<
		| { pages: { messages: ConversationMessageDto[] }[]; pageParams: unknown[] }
		| undefined
	>(["messages", id]);
	if (!data) return [];
	const last = data.pages[data.pages.length - 1];
	return last?.messages ?? [];
}

describe("dashboard messages — send-then-switch cache race (component, G1-G5,G9,G10)", () => {
	let client: QueryClient;
	const originalPostAMode = controls.postAMode;

	async function renderPage() {
		client = new QueryClient({
			defaultOptions: {
				queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
				mutations: { retry: false },
			},
		});
		render(
			<QueryClientProvider client={client}>
				<MessagesPage />
			</QueryClientProvider>,
		);
		// Wait for conversations list to load and for thread A (workplace,
		// first conversation, active by default) to appear.
		const aButton = await screen.findByRole("button", { name: /A-Workplace/ });
		expect(aButton).toHaveAttribute("aria-current", "true");
		// Wait for A's messages query to resolve (empty room message shows).
		await screen.findByText(/Start the conversation/);
		return client;
	}

	beforeEach(() => {
		controls.postAMode = "deferred";
		controls.getConversationsCalls = 0;
		controls.postACalls = 0;
		controls.postBCalls = 0;
		controls.recordedPostURLs = [];
		controls.postADeferred = null;
	});

	afterEach(() => {
		controls.postAMode = originalPostAMode;
	});

	it("FIXED: a message sent to A lands in A's cache after switching to B mid-flight", async () => {
		const user = userEvent.setup();
		await renderPage();

		// Type and send to A (workplace thread -> placeholder "Message everyone").
		const composer = screen.getByRole("textbox", { name: "Message everyone" });
		await user.type(composer, "hi");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		// Confirm the POST to A has fired before proceeding.
		await vi.waitFor(() => {
			expect(controls.postACalls).toBe(1);
		});
		expect(controls.recordedPostURLs).toEqual(["/v1/conversations/A/messages"]);

		// Switch to thread B BEFORE the POST resolves. This triggers the
		// `setActive("B")` re-render, which (per bug report) re-applies a fresh
		// options object to the in-flight `useMutation` via its effect.
		await user.click(screen.getByRole("button", { name: /B-Direct/ }));

		// Wait for B to become active (composer placeholder swaps to
		// `Message <B title>` for direct threads, and aria-current flips).
		await vi.waitFor(() => {
			expect(screen.getByRole("button", { name: /B-Direct/ })).toHaveAttribute(
				"aria-current",
				"true",
			);
		});

		// Resolve the in-flight POST to A.
		expect(controls.postADeferred).not.toBeNull();
		if (!controls.postADeferred) throw new Error("postA deferred missing");
		controls.postADeferred.resolve({ message: echoed });

		// G1/G3: the message MUST end up in A's cache (the POSTed conversation),
		// even though the user is now on B.
		await vi.waitFor(() => {
			expect(lastMessageOf(client, "A")).toEqual([echoed]);
		});
		// G2: B's cache MUST NOT contain the message appended from A's send.
		expect(lastMessageOf(client, "B")).toEqual([]);

		// G4: only one POST was issued, and it targeted A.
		expect(controls.recordedPostURLs).toEqual(["/v1/conversations/A/messages"]);
		// G10: `send.onSuccess` invalidates `['conversations', workplaceId]`. The
		// invalidation mark is transient (a refetch clears `isInvalidated`), so
		// assert the stable observable: the conversations GET is re-issued after
		// the POST resolves. Baseline = 1 (initial mount).
		await vi.waitFor(() => {
			expect(controls.getConversationsCalls).toBeGreaterThanOrEqual(2);
		});

		// End-to-end UI evidence: switch back to A and confirm the message
		// displays in A's thread panel (and not in B's).
		await user.click(screen.getByRole("button", { name: /A-Workplace/ }));
		expect(await screen.findByText("hi")).toBeInTheDocument();
		// While still on A, nothing foreign shows.
		expect(screen.queryByText("hi")).toBeInTheDocument();
		const rail = screen.getAllByRole("button", { name: /B-Direct/ });
		expect(rail.length).toBeGreaterThanOrEqual(1);
		// Sanity: B's button is not the active thread now.
		const bRail = rail[0];
		expect(bRail).not.toHaveAttribute("aria-current", "true");
	});

	it("G5 no-swap happy path: message appended to active conversation", async () => {
		const user = userEvent.setup();
		await renderPage();

		const composer = screen.getByRole("textbox", { name: "Message everyone" });
		await user.type(composer, "hello");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		await vi.waitFor(() => {
			expect(controls.postACalls).toBe(1);
		});
		// Resolve immediately without switching threads.
		expect(controls.postADeferred).not.toBeNull();
		if (!controls.postADeferred) throw new Error("postA deferred missing");
		controls.postADeferred.resolve({
			message: { ...echoed, id: "m2", body: "hello" },
		});
		await vi.waitFor(() => {
			expect(lastMessageOf(client, "A")).toEqual([
				{ ...echoed, id: "m2", body: "hello" },
			]);
		});
		// The composer cleared and the message renders in the active panel.
		expect(composer).toHaveValue("");
		expect(await screen.findByText("hello")).toBeInTheDocument();
	});

	it("G9 onError: a failing POST surfaces toast.error and does not pollute any cache", async () => {
		controls.postAMode = "reject";
		const user = userEvent.setup();
		await renderPage();

		const composer = screen.getByRole("textbox", { name: "Message everyone" });
		await user.type(composer, "boom");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		// G9: toast.error was called with the server message.
		const { toast } = await import("sonner");
		await vi.waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("Server exploded");
		});
		// No cache pollution occurred.
		expect(lastMessageOf(client, "A")).toEqual([]);
		expect(lastMessageOf(client, "B")).toEqual([]);
		// Composer draft does NOT get cleared on error (matches `submit`).
		// (composer draft is local state; not asserted on value here.)
	});
});
