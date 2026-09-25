import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormSheet } from "./form-sheet";

describe("FormSheet", () => {
	it("renders CRUD forms as a titled dialog", () => {
		render(
			<FormSheet
				open
				onOpenChange={() => {}}
				title="Edit shift"
				description="Update the draft shift."
				footer={<button type="button">Save</button>}
			>
				<label htmlFor="shift-note">Note</label>
				<input id="shift-note" />
			</FormSheet>,
		);

		const dialog = screen.getByRole("dialog", { name: "Edit shift" });
		expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
		expect(screen.getByLabelText("Note")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
	});
});
