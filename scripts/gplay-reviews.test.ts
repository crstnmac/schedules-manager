import { expect, test } from "bun:test";
import { csvCell, managerSignal } from "./gplay-reviews";

test("manager signal requires an explicit operator phrase", () => {
	expect(managerSignal("I manage two locations and need schedules")).toBe(true);
	expect(managerSignal("the app crashes on my phone")).toBe(false);
});

test("CSV export neutralizes spreadsheet formulas", () => {
	expect(csvCell("=SUM(1,1)")).toBe('"\t=SUM(1,1)"');
});
