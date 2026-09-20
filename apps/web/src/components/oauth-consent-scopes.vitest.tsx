import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { OAuthConsentScopes } from "./oauth-consent-scopes";

describe("OAuthConsentScopes", () => {
	test("lets the user toggle jooling permissions", () => {
		const onToggle = vi.fn();
		render(
			<OAuthConsentScopes
				requestedScopes={["openid", "schedule.read", "schedule.write"]}
				selectedScopes={["openid", "schedule.read", "schedule.write"]}
				onToggle={onToggle}
			/>,
		);

		const scheduleWrite = screen.getByRole("checkbox", {
			name: "Create and change draft schedules, and publish them",
		});
		expect(scheduleWrite).not.toBeDisabled();
		fireEvent.click(scheduleWrite);
		expect(onToggle).toHaveBeenCalledWith("schedule.write", false);
	});

	test("keeps OAuth identity scopes selected and locked", () => {
		render(
			<OAuthConsentScopes
				requestedScopes={["openid", "profile", "email"]}
				selectedScopes={["openid", "profile", "email"]}
				onToggle={() => undefined}
			/>,
		);

		for (const name of [
			"Confirm who you are",
			"See your basic profile",
			"See your email address",
		]) {
			const checkbox = screen.getByRole("checkbox", { name });
			expect(checkbox).toBeChecked();
			expect(checkbox).toHaveAttribute("aria-disabled", "true");
		}
	});
});
