import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { QueryClient } from "@tanstack/react-query";

import {
	appendMessageToLastPage,
	handleSendSuccess,
	type MessagesInfiniteData,
	type SendResult,
	type SendVariables,
} from "./messages-cache";
import type { ConversationMessageDto } from "./queries";

const requireFromHere = createRequire(import.meta.url);
const reactQueryPkgPath = requireFromHere.resolve(
	"@tanstack/react-query/package.json",
);
const requireFromReactQuery = createRequire(reactQueryPkgPath);
const queryCorePkgPath = requireFromReactQuery.resolve(
	"@tanstack/query-core/package.json",
);
const queryCorePkg = JSON.parse(readFileSync(queryCorePkgPath, "utf8")) as {
	exports: { ".": { import: { default: string } | string } };
};
const queryCoreImportExport = queryCorePkg.exports["."].import;
const queryCoreModernRel =
	typeof queryCoreImportExport === "string"
		? queryCoreImportExport
		: queryCoreImportExport.default;
const queryCoreUrl = pathToFileURL(
	join(dirname(queryCorePkgPath), queryCoreModernRel),
).href;

function msg(id: string, body: string): ConversationMessageDto {
	return {
		id,
		body,
		author: "Me",
		authorEmploymentId: "e1",
		createdAt: "2026-09-05T00:00:00.000Z",
	};
}

function seed(
	client: QueryClient,
	id: string,
	messages: ConversationMessageDto[],
): void {
	client.setQueryData<MessagesInfiniteData>(["messages", id], {
		pages: [{ messages, hasMore: false }],
		pageParams: [undefined],
	});
}

function getMessages(
	client: QueryClient,
	id: string,
): ConversationMessageDto[] {
	const data = client.getQueryData<MessagesInfiniteData>(["messages", id]);
	return (data?.pages ?? []).flatMap((page) => page.messages);
}

describe("appendMessageToLastPage", () => {
	test("appends to the single page of a single-page cache", () => {
		const existing: MessagesInfiniteData = {
			pages: [{ messages: [msg("a1", "one")], hasMore: false }],
			pageParams: [undefined],
		};
		const next = appendMessageToLastPage(existing, msg("a2", "two"));
		expect(next?.pages).toHaveLength(1);
		expect(next?.pages[0].messages).toEqual([
			msg("a1", "one"),
			msg("a2", "two"),
		]);
		expect(next?.pages[0].hasMore).toBe(false);
		expect(next?.pageParams).toEqual([undefined]);
	});

	test("appends only to the last page across multiple pages", () => {
		const existing: MessagesInfiniteData = {
			pages: [
				{ messages: [msg("a1", "one")], hasMore: true },
				{ messages: [msg("a2", "two")], hasMore: false },
			],
			pageParams: [undefined, "cur"],
		};
		const next = appendMessageToLastPage(existing, msg("a3", "three"));
		expect(next?.pages[0].messages).toEqual([msg("a1", "one")]);
		expect(next?.pages[1].messages).toEqual([
			msg("a2", "two"),
			msg("a3", "three"),
		]);
		expect(next?.pageParams).toEqual([undefined, "cur"]);
	});

	test("returns undefined when existing is undefined (no partial cache entry)", () => {
		expect(appendMessageToLastPage(undefined, msg("a1", "x"))).toBeUndefined();
	});

	test("does not mutate the input and preserves hasMore on every page", () => {
		const firstPageMessages = [msg("a1", "one")];
		const lastPageMessages = [msg("a2", "two")];
		const existing: MessagesInfiniteData = {
			pages: [
				{ messages: firstPageMessages, hasMore: true },
				{ messages: lastPageMessages, hasMore: false },
			],
			pageParams: [undefined, "cur"],
		};
		const origPages = existing.pages;
		const origFirstPage = existing.pages[0];
		const origPageParams = existing.pageParams;
		const next = appendMessageToLastPage(existing, msg("a3", "three"));

		expect(existing.pages).toBe(origPages);
		expect(existing.pages[0]).toBe(origFirstPage);
		expect(existing.pages[0].messages).toBe(firstPageMessages);
		expect(existing.pages[1].messages).toBe(lastPageMessages);
		expect(existing.pages[1].messages).toEqual([msg("a2", "two")]);
		expect(existing.pageParams).toBe(origPageParams);

		expect(next?.pages[0]).toBe(origFirstPage);
		expect(next?.pages[1].messages).not.toBe(lastPageMessages);
		expect(next?.pages[0].hasMore).toBe(true);
		expect(next?.pages[1].hasMore).toBe(false);
		expect(next?.pageParams).toBe(origPageParams);
	});
});

describe("handleSendSuccess", () => {
	test("writes to the cache of vars.conversationId, not any render-scope id", () => {
		const client = new QueryClient();
		seed(client, "A", [msg("a1", "old in A")]);
		seed(client, "B", [msg("b1", "old in B")]);
		handleSendSuccess(
			client,
			{ message: msg("m-new", "hi") },
			{ conversationId: "A", body: "hi" },
			"w1",
		);
		expect(getMessages(client, "A")).toEqual([
			msg("a1", "old in A"),
			msg("m-new", "hi"),
		]);
		expect(getMessages(client, "B")).toEqual([msg("b1", "old in B")]);
	});

	test("appends to the last page across multiple loaded pages", () => {
		const client = new QueryClient();
		client.setQueryData<MessagesInfiniteData>(["messages", "A"], {
			pages: [
				{ messages: [msg("a1", "one")], hasMore: false },
				{ messages: [msg("a2", "two")], hasMore: false },
			],
			pageParams: [undefined, "cursor"],
		});
		handleSendSuccess(
			client,
			{ message: msg("a3", "three") },
			{ conversationId: "A", body: "three" },
			"w1",
		);
		const data = client.getQueryData<MessagesInfiniteData>(["messages", "A"]);
		expect(data?.pages).toHaveLength(2);
		expect(data?.pages[0].messages).toEqual([msg("a1", "one")]);
		expect(data?.pages[1].messages).toEqual([
			msg("a2", "two"),
			msg("a3", "three"),
		]);
		expect(data?.pageParams).toEqual([undefined, "cursor"]);
	});

	test("does not create a cache entry when the destination has no data", () => {
		const client = new QueryClient();
		seed(client, "B", [msg("b1", "old")]);
		handleSendSuccess(
			client,
			{ message: msg("m", "x") },
			{ conversationId: "A", body: "x" },
			"w1",
		);
		expect(client.getQueryData(["messages", "A"])).toBeUndefined();
		expect(getMessages(client, "B")).toEqual([msg("b1", "old")]);
	});

	test("invalidates the workplace's conversations list", () => {
		const client = new QueryClient();
		client.setQueryData(["conversations", "w1"], { conversations: [] });
		handleSendSuccess(
			client,
			{ message: msg("m", "x") },
			{ conversationId: "A", body: "x" },
			"w1",
		);
		expect(
			client.getQueryCache().find({ queryKey: ["conversations", "w1"] })?.state
				.isInvalidated,
		).toBe(true);
	});

	test("invalidates only the sending workplace's conversations list", () => {
		const client = new QueryClient();
		client.setQueryData(["conversations", "w1"], { conversations: [] });
		client.setQueryData(["conversations", "w2"], { conversations: [] });
		handleSendSuccess(
			client,
			{ message: msg("m", "x") },
			{ conversationId: "A", body: "x" },
			"w1",
		);
		expect(
			client.getQueryCache().find({ queryKey: ["conversations", "w1"] })?.state
				.isInvalidated,
		).toBe(true);
		expect(
			client.getQueryCache().find({ queryKey: ["conversations", "w2"] })?.state
				.isInvalidated,
		).toBe(false);
	});
});

describe("send mutation race (TanStack MutationObserver)", () => {
	test("mid-send A->B switch: POST targets A and the cache write targets A, B untouched", async () => {
		const { MutationObserver } = await import(queryCoreUrl);
		const client = new QueryClient();
		seed(client, "A", [msg("a1", "old in A")]);
		seed(client, "B", [msg("b1", "old in B")]);
		client.setQueryData(["conversations", "w1"], { conversations: [] });

		let postedTo = "";
		let resolvePost: () => void = () => {};
		const postMessage = (
			conversationId: string,
			_body: string,
		): Promise<SendResult> => {
			postedTo = conversationId;
			return new Promise<SendResult>((resolve) => {
				resolvePost = () => resolve({ message: msg("m-new", "hi") });
			});
		};

		const makeOptions = () => ({
			mutationFn: (vars: SendVariables) =>
				postMessage(vars.conversationId, vars.body),
			onSuccess: (result: SendResult, vars: SendVariables) =>
				handleSendSuccess(client, result, vars, "w1"),
		});

		const observer = new MutationObserver(client, makeOptions());
		const pending = observer.mutate({ conversationId: "A", body: "hi" });

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(postedTo).toBe("A");

		// Simulates the user switching threads mid-send: useMutation's effect
		// re-runs observer.setOptions with the latest render's closures.
		observer.setOptions(makeOptions());

		resolvePost();
		await pending;

		expect(postedTo).toBe("A");
		expect(getMessages(client, "A")).toEqual([
			msg("a1", "old in A"),
			msg("m-new", "hi"),
		]);
		expect(getMessages(client, "B")).toEqual([msg("b1", "old in B")]);
		expect(
			client.getQueryCache().find({ queryKey: ["conversations", "w1"] })?.state
				.isInvalidated,
		).toBe(true);
	});
});
