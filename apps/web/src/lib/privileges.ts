export type EmploymentKind = "manager" | "worker" | "viewer";

export interface PrivilegeSubject {
	kind: EmploymentKind;
	privileges: readonly string[] | null | undefined;
}

/**
 * Mirrors the server's hasPrivilege: a manager with no explicit privileges
 * keeps full access, a viewer only gets the capabilities listed explicitly,
 * and any other kind never holds manager capabilities.
 */
export function hasCapability(
	subject: PrivilegeSubject | null | undefined,
	key: string,
): boolean {
	if (!subject) return false;
	if (subject.kind === "viewer") {
		return (subject.privileges ?? []).includes(key);
	}
	if (subject.kind !== "manager") return false;
	const explicit = subject.privileges;
	if (!explicit || explicit.length === 0) return true;
	return explicit.includes(key);
}
