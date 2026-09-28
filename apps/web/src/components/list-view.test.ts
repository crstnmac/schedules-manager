import { describe, expect, test } from "bun:test";

import { applyListView, type ListFilter, type ListSort } from "./list-view";

type Row = { id: string; name: string; status: string; tags: string[] };

const rows: Row[] = [
	{ id: "1", name: "Priya", status: "pending", tags: ["bar"] },
	{ id: "2", name: "Luis", status: "approved", tags: ["floor", "bar"] },
	{ id: "3", name: "Ben", status: "pending", tags: ["kitchen"] },
];

const filters: ListFilter<Row>[] = [
	{
		id: "status",
		label: "Status",
		options: [],
		value: (row) => row.status,
	},
	{ id: "tag", label: "Tag", options: [], value: (row) => row.tags },
];
const sorts: ListSort<Row>[] = [
	{
		id: "name",
		label: "Name",
		compare: (a, b) => a.name.localeCompare(b.name),
	},
];
const base = {
	search: "",
	searchText: (row: Row) => [row.name],
	filters,
	filterValues: {},
	sort: null,
	sorts,
};
const ids = (result: Row[]) => result.map((row) => row.id);

describe("applyListView", () => {
	test("search matches any of the row's text, case-insensitively", () => {
		expect(ids(applyListView(rows, { ...base, search: "  lu " }))).toEqual([
			"2",
		]);
	});

	test("a filter keeps rows matching any chosen value", () => {
		expect(
			ids(
				applyListView(rows, {
					...base,
					filterValues: { status: ["pending", "approved"] },
				}),
			),
		).toEqual(["1", "2", "3"]);
		expect(
			ids(applyListView(rows, { ...base, filterValues: { tag: ["bar"] } })),
		).toEqual(["1", "2"]);
	});

	test("different filters must all match", () => {
		expect(
			ids(
				applyListView(rows, {
					...base,
					filterValues: { status: ["pending"], tag: ["bar"] },
				}),
			),
		).toEqual(["1"]);
	});

	test("sorting covers every row, in either direction", () => {
		expect(
			ids(
				applyListView(rows, {
					...base,
					sort: { id: "name", direction: "asc" },
				}),
			),
		).toEqual(["3", "2", "1"]);
		expect(
			ids(
				applyListView(rows, {
					...base,
					sort: { id: "name", direction: "desc" },
				}),
			),
		).toEqual(["1", "2", "3"]);
	});
});
