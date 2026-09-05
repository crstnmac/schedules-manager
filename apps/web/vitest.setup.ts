import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// happy-dom lacks several layout/browser APIs that UI primitives from
// @shadcn/react and our MessageScroller reach for. Polyfill the common ones so
// mounting a real `ConversationWorkspace` does not throw during a render-only
// component test (none of these are exercised by the assertions; they only
// need to exist so effects can call them without throwing).

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

class IntersectionObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
	takeRecords(): unknown[] {
		return [];
	}
	root = null;
	rootMargin = "";
	thresholds = [];
}

if (!("ResizeObserver" in globalThis)) {
	(
		globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }
	).ResizeObserver = ResizeObserverStub;
}
if (!("IntersectionObserver" in globalThis)) {
	(
		globalThis as unknown as {
			IntersectionObserver: typeof IntersectionObserverStub;
		}
	).IntersectionObserver = IntersectionObserverStub;
}

if (!("matchMedia" in globalThis)) {
	(globalThis as unknown as { matchMedia: () => unknown }).matchMedia = () => ({
		matches: false,
		media: "",
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		onchange: null,
		dispatchEvent() {
			return false;
		},
	});
}

// scrolling APIs the message scroller may touch
if (!("scrollTo" in globalThis)) {
	(globalThis as unknown as { scrollTo: () => void }).scrollTo = () => {};
}
if (
	typeof globalThis.Element !== "undefined" &&
	!Element.prototype.scrollIntoView
) {
	Element.prototype.scrollIntoView = () => {};
}
if (
	typeof globalThis.Element !== "undefined" &&
	!Element.prototype.hasPointerCapture
) {
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
