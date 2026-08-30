export function homePath(input: {
	employments: { kind: "manager" | "worker" }[];
	pendingInvitationCount: number;
}): "/dashboard" | "/worker" | "/join" | "/onboarding" {
	if (input.employments.some((employment) => employment.kind === "manager")) {
		return "/dashboard";
	}
	if (input.employments.length > 0) return "/worker";
	if (input.pendingInvitationCount > 0) return "/join";
	return "/onboarding";
}
