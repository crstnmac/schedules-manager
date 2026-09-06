export function friendlyMessage(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	if (/timeout|network|fetch/i.test(raw) || /aborted/i.test(raw)) {
		return "The request timed out. Check your connection and try again.";
	}
	if (/\b(401|403)\b/.test(raw)) {
		return "Your session has ended. Sign in again.";
	}
	if (/\b409\b/.test(raw)) {
		return "This changed while you were away. Refresh and try again.";
	}
	return "Something went wrong. Try again.";
}
