import {
	createContext,
	type PropsWithChildren,
	useContext,
	useMemo,
} from "react";

import { authClient } from "./auth-client";

type AuthUser = NonNullable<
	ReturnType<typeof authClient.useSession>["data"]
>["user"];

type AuthContextValue = {
	isLoading: boolean;
	user: AuthUser | null;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
	const { data: session, isPending } = authClient.useSession();

	const value = useMemo<AuthContextValue>(
		() => ({
			isLoading: isPending,
			user: session?.user ?? null,
			signOut: async () => {
				const { error } = await authClient.signOut();
				if (error) throw error;
			},
		}),
		[isPending, session],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used inside AuthProvider");
	return context;
}
