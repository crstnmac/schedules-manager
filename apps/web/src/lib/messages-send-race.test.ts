/**
 * Covers G1-G4: the cross-conversation cache-misroute race fixed by threading
 * the target conversation id through the `useMutation` variables.
 *
 * Mechanism (per bug report Evidence 1-3, verified against installed
 * @tanstack/react-query@5.102.8 / @tanstack/query-core@5.102.8):
 *
 *  - `MutationObserver.setOptions(options)` forwards to the in-flight mutation
 *    via `this.#currentMutation.setOptions(this.options)` when the mutation is
 *    pending (mutationObserver.cjs:32).
 *  - `Mutation.setOptions` just assigns `this.options = options`
 *    (mutation.cjs:21-24).
 *  - `Mutation.execute` resolves against `this.options.onSuccess` at settle
 *    time (mutation.cjs:108): `await this.options.onSuccess?.(data, variables, ...)`.
 *
 * So if `useMutation` (which calls `observer.setOptions` on every re-render via
 * its `useEffect`) re-creates the options object after the user switches
 * threads, `onSuccess`'s closure is rebound — and the cache-append misroutes.
 *
 * The FIXED shape reads `variables.targetId` in `onSuccess` (captured at
 * `mutate()` time, passed through unchanged by `execute`), so the cache key
 * matches the POSTed conversation regardless of options swaps mid-flight.
 *
 * This test uses only `@tanstack/query-core` (a transitive dep hoisted as a
 * direct devDep for testing) and `bun:test`. No DOM, no `api()`, no env.
 */
import { describe, expect, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/query-core";

import type { ConversationMessageDto } from "@/lib/queries";

type MessagesPage = { messages: ConversationMessageDto[]; hasMore: boolean };
type InfiniteCache =
	| {
			pages: MessagesPage[];
			pageParams: unknown[];
	  }
	| undefined;

const echoed: ConversationMessageDto = {
	id: "m1",
	body: "hi",
	author: "Me",
	authorEmploymentId: "e1",
	createdAt: "2026-09-05T00:00:00.000Z",
};

function emptyPage(): MessagesPage {
	return { messages: [], hasMore: false };
}

function seedMessages(client: QueryClient, key: string): void {
	client.setQueryData(["messages", key], {
		pages: [emptyPage()],
		pageParams: [undefined],
	});
}

function messagesOf(
	client: QueryClient,
	key: string,
): ConversationMessageDto[] {
	const data = client.getQueryData<
		{ pages: MessagesPage[]; pageParams: unknown[] } | undefined
	>(["messages", key]);
	return data?.pages[data.pages.length - 1]?.messages ?? [];
}

// Updater identical to `send.onSuccess` of both route files.
function appendUpdater(messageP: ConversationMessageDto) {
	return (existing: InfiniteCache): InfiniteCache =>
		existing
			? {
					pages: existing.pages.map((page, index) =>
						index === existing.pages.length - 1
							? { ...page, messages: [...page.messages, messageP] }
							: page,
					),
					pageParams: existing.pageParams,
				}
			: existing;
}

function makeDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// Flush enough microtasks for `Mutation.execute` to call `mutationFn`
// (synchronously inside `retryer.start()` -> `run()` -> `config.fn()`), so the
// recorded URL reflects the options active at mutate time, before any later
// `setOptions` swap. A setTimeout(0) macrotask guarantees all the pre-await
// microtasks in `execute` have drained.
function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("send mutation cross-conversation cache race (G1-G4)", () => {
	// Positive: the FIXED shape appends into the conversation the POST targeted,
	// even though the observer's options are swapped mid-flight to point at B.
	test("FIXED: message lands in conversation it was POSTed to after mid-flight options swap", async () => {
		const client = new QueryClient();
		seedMessages(client, "A");
		seedMessages(client, "B");
		const deferred = makeDeferred<{ message: ConversationMessageDto }>();
		let recordedUrl: string | undefined;

		const makeFixedOptions = () => ({
			mutationFn: ({ targetId, body }: { targetId: string; body: string }) => {
				recordedUrl = `/v1/conversations/${targetId}/messages`;
				void body;
				return deferred.promise;
			},
			onSuccess: (
				result: { message: ConversationMessageDto },
				variables: { targetId: string; body: string },
			) => {
				client.setQueryData(
					["messages", variables.targetId],
					appendUpdater(result.message),
				);
			},
		});

		const observer = new MutationObserver(client, makeFixedOptions());
		const p = observer.mutate({ targetId: "A", body: "hi" });
		await flushMicrotasks();

		// Simulate the re-render after the user switches active thread A -> B:
		// `useMutation`'s `useEffect` calls `observer.setOptions` with the fresh
		// options object literal from this render. The FIXED shape is invariant
		// to this swap because the cache key comes from `variables.targetId`.
		observer.setOptions(makeFixedOptions());

		deferred.resolve({ message: echoed });
		await p;

		expect(messagesOf(client, "A")).toEqual([echoed]); // G1, G3
		expect(messagesOf(client, "B")).toEqual([]); // G2
		expect(recordedUrl).toBe("/v1/conversations/A/messages"); // G4
	});

	// Negative control: the BUGGY shape (closing over a live `conversationId`)
	// reproduces the original misroute — the message lands in B, not A. This
	// proves the harness is sensitive to the bug and that the fixed shape is
	// what prevents it.
	test("BUGGY (negative control): message misrouted into the now-active conversation", async () => {
		const client = new QueryClient();
		seedMessages(client, "A");
		seedMessages(client, "B");
		const deferred = makeDeferred<{ message: ConversationMessageDto }>();
		let recordedUrl: string | undefined;
		let conversationId = "A"; // buggy: live component-closure variable

		const makeBuggyOptions = () => ({
			mutationFn: (body: string) => {
				recordedUrl = `/v1/conversations/${conversationId}/messages`;
				void body;
				return deferred.promise;
			},
			onSuccess: (result: { message: ConversationMessageDto }) => {
				// buggy: closes over live `conversationId`, not the POSTed target
				client.setQueryData(
					["messages", conversationId],
					appendUpdater(result.message),
				);
			},
		});

		const observer = new MutationObserver(client, makeBuggyOptions());
		const p = observer.mutate("hi");
		await flushMicrotasks();

		// Switch threads: live `conversationId` becomes "B", then `useMutation`
		// re-applies a fresh options object (closing over B) to the in-flight
		// mutation via `observer.setOptions`.
		conversationId = "B";
		observer.setOptions(makeBuggyOptions());

		deferred.resolve({ message: echoed });
		await p;

		// Buggy behavior reproduced: message appended to the now-active thread.
		expect(messagesOf(client, "A")).toEqual([]); // G1 (would-be): empty
		expect(messagesOf(client, "B")).toEqual([echoed]); // G2 (would-be): polluted
		expect(recordedUrl).toBe("/v1/conversations/A/messages"); // G4: URL locked at send
	});

	// No-thread-switch happy path (covers G5): the fixed shape appends into the
	// active conversation exactly as before when no options swap occurs.
	test("FIXED no-swap happy path: message appended to active conversation", async () => {
		const client = new QueryClient();
		seedMessages(client, "A");
		seedMessages(client, "B");
		const deferred = makeDeferred<{ message: ConversationMessageDto }>();

		const fixedOptions = {
			mutationFn: ({ targetId, body }: { targetId: string; body: string }) => {
				void targetId;
				void body;
				return deferred.promise;
			},
			onSuccess: (
				result: { message: ConversationMessageDto },
				variables: { targetId: string; body: string },
			) => {
				client.setQueryData(
					["messages", variables.targetId],
					appendUpdater(result.message),
				);
			},
		};

		const observer = new MutationObserver(client, fixedOptions);
		const p = observer.mutate({ targetId: "A", body: "hi" });
		deferred.resolve({ message: echoed });
		await p;

		expect(messagesOf(client, "A")).toEqual([echoed]); // G5
		expect(messagesOf(client, "B")).toEqual([]);
	});
});
