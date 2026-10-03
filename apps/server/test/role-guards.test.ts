import type { Employment } from "@SchedulesManager/db";
import { describe, expect, test } from "bun:test";

import {
	assertCanAssignRole,
	assertCanManageEmployment,
	assertLocationsGrantable,
	isFullManager,
} from "../src/context";
import { ForbiddenError } from "../src/errors";

function employment(
	kind: Employment["kind"],
	privileges: string[] | null = null,
): Employment {
	return { kind, privileges } as Employment;
}

const fullManager = employment("manager");
const workersOnlyManager = employment("manager", ["workers.manage"]);
const workersViewer = employment("viewer", ["workers.manage"]);

describe("isFullManager", () => {
	test("only a Manager without explicit privileges is full", () => {
		expect(isFullManager(fullManager)).toBe(true);
		expect(isFullManager(employment("manager", []))).toBe(true);
		expect(isFullManager(workersOnlyManager)).toBe(false);
		expect(isFullManager(workersViewer)).toBe(false);
	});
});

describe("assertCanAssignRole", () => {
	test("a full Manager may grant any role", () => {
		expect(() => assertCanAssignRole(fullManager, "manager", [])).not.toThrow();
		expect(() =>
			assertCanAssignRole(fullManager, "viewer", ["settings.manage"]),
		).not.toThrow();
	});

	test("a restricted Manager or Viewer cannot create Managers", () => {
		expect(() =>
			assertCanAssignRole(workersOnlyManager, "manager", []),
		).toThrow(ForbiddenError);
		expect(() =>
			assertCanAssignRole(workersViewer, "manager", ["workers.manage"]),
		).toThrow(ForbiddenError);
	});

	test("nobody grants a privilege they do not hold", () => {
		expect(() =>
			assertCanAssignRole(workersViewer, "viewer", ["workers.manage"]),
		).not.toThrow();
		expect(() =>
			assertCanAssignRole(workersViewer, "viewer", ["settings.manage"]),
		).toThrow(ForbiddenError);
	});

	test("anyone who manages workers may make someone a Worker", () => {
		expect(() =>
			assertCanAssignRole(workersViewer, "worker", []),
		).not.toThrow();
	});
});

describe("assertCanManageEmployment", () => {
	test("only a full Manager changes a Manager", () => {
		expect(() =>
			assertCanManageEmployment(fullManager, employment("manager")),
		).not.toThrow();
		expect(() =>
			assertCanManageEmployment(workersOnlyManager, employment("manager")),
		).toThrow(ForbiddenError);
	});

	test("nobody changes someone holding privileges they lack", () => {
		expect(() =>
			assertCanManageEmployment(
				workersViewer,
				employment("viewer", ["settings.manage"]),
			),
		).toThrow(ForbiddenError);
		expect(() =>
			assertCanManageEmployment(workersViewer, employment("worker", [])),
		).not.toThrow();
	});
});

describe("assertLocationsGrantable", () => {
	const scoped = new Set(["loc-a", "loc-b"]);

	test("unrestricted actors and Worker grants are never limited", () => {
		expect(() => assertLocationsGrantable(null, "viewer", [])).not.toThrow();
		expect(() => assertLocationsGrantable(scoped, "worker", [])).not.toThrow();
	});

	test("a scoped actor grants Viewer access only inside their Locations", () => {
		expect(() =>
			assertLocationsGrantable(scoped, "viewer", ["loc-a"]),
		).not.toThrow();
		expect(() =>
			assertLocationsGrantable(scoped, "viewer", ["loc-a", "loc-c"]),
		).toThrow(ForbiddenError);
	});

	test("an empty set means every Location, so a scoped actor cannot grant it", () => {
		expect(() => assertLocationsGrantable(scoped, "viewer", [])).toThrow(
			ForbiddenError,
		);
	});
});
