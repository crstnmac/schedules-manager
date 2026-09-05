/**
 * T8 — Component-level regression test for `apps/web/src/routes/worker/messages.tsx`.
 *
 * Mirrors T7 but targets the worker route. The worker route wires
 * `onSelect={setActiveId}` to `ConversationWorkspace` (line 71), so the same
 * `setActive(B)` re-render trigger exists there. Running this confirms the fix
 * was applied to BOTH routes (G8), not only the dashboard route.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationDto, ConversationMessageDto } from "@/lib/queries";

const controls = vi.hoisted(() => ({
	postADeferred: null as {
		promise: Promise<{ message: ConversationMessageDto }>;
		resolve: (value: { message: ConversationMessageDto }) => void;
		reject: (error: unknown) => void;
	} | null,
	postAMode: "deferred" as "deferred" | "reject",
	postAErrorMessage: "Server exploded",
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
			if (method === "GET" && path === "/v1/me") {
				return {
					profile: {
						id: "p1",
						email: "worker@example.com",
						fullName: "Worker One",
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
							id: "e2",
							kind: "worker",
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
	counterpart: { employmentId: "e3", name: "B", email: "b@example.com" },
	lastMessage: null,
};

const echoed: ConversationMessageDto = {
	id: "m1",
	body: "hi",
	author: "Worker One",
	authorEmploymentId: "e2",
	createdAt: "2026-09-05T00:00:00.000Z",
};

import { WorkerMessagesPage } from "@/routes/worker/messages";

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

describe("worker messages — send-then-switch cache race (component, G8)", () => {
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
				<WorkerMessagesPage />
			</QueryClientProvider>,
		);
		const aButton = await screen.findByRole("button", { name: /A-Workplace/ });
		expect(aButton).toHaveAttribute("aria-current", "true");
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

	it("FIXED (worker route): a message sent to A lands in A's cache after switching to B mid-flight", async () => {
		const user = userEvent.setup();
		await renderPage();

		const composer = screen.getByRole("textbox", { name: "Message everyone" });
		await user.type(composer, "hi");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		await vi.waitFor(() => {
			expect(controls.postACalls).toBe(1);
		});
		expect(controls.recordedPostURLs).toEqual(["/v1/conversations/A/messages"]);

		// Switch to B before the POST resolves — triggers the option-swap
		// re-render on the in-flight `useMutation`.
		await user.click(screen.getByRole("button", { name: /B-Direct/ }));
		await vi.waitFor(() => {
			expect(screen.getByRole("button", { name: /B-Direct/ })).toHaveAttribute(
				"aria-current",
				"true",
			);
		});

		expect(controls.postADeferred).not.toBeNull();
		if (!controls.postADeferred) throw new Error("postA deferred missing");
		controls.postADeferred.resolve({ message: echoed });

		// G1/G3: message lands in A (the POSTed conversation) even though the
		// user is now on B.
		await vi.waitFor(() => {
			expect(lastMessageOf(client, "A")).toEqual([echoed]);
		});
		// G2: B's cache is untouched by A's send.
		expect(lastMessageOf(client, "B")).toEqual([]);
		// G4: the single POST targeted A.
		expect(controls.recordedPostURLs).toEqual(["/v1/conversations/A/messages"]);
		// G10: conversations query was invalidated (refetch observed).
		await vi.waitFor(() => {
			expect(controls.getConversationsCalls).toBeGreaterThanOrEqual(2);
		});

		// UI evidence: switch back to A shows the sent message.
		await user.click(screen.getByRole("button", { name: /A-Workplace/ }));
		expect(await screen.findByText("hi")).toBeInTheDocument();
	});

	it("G5 no-swap happy path (worker route)", async () => {
		const user = userEvent.setup();
		await renderPage();

		const composer = screen.getByRole("textbox", { name: "Message everyone" });
		await user.type(composer, "hello");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		await vi.waitFor(() => {
			expect(controls.postACalls).toBe(1);
		});
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
		expect(composer).toHaveValue("");
		expect(await screen.findByText("hello")).toBeInTheDocument();
	});

	it("G9 onError (worker route): failing POST surfaces toast.error and pollutes no cache", async () => {
		controls.postAMode = "reject";
		const user = userEvent.setup();
		await renderPage();

		const composer = screen.getByRole("textbox", { name: "Message everyone" });
		await user.type(composer, "boom");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		const { toast } = await import("sonner");
		await vi.waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("Server exploded");
		});
		expect(lastMessageOf(client, "A")).toEqual([]);
		expect(lastMessageOf(client, "B")).toEqual([]);
	});
});
