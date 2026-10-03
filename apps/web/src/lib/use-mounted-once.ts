import { useState } from "react";

/**
 * True once `active` has ever been true. Lets heavy, lazily loaded dialogs
 * mount on first open and stay mounted so their close animation still plays.
 */
export function useMountedOnce(active: boolean): boolean {
	const [mounted, setMounted] = useState(active);
	if (active && !mounted) setMounted(true);
	return mounted;
}
