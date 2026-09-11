import type { AuthSessionRecord, AuthUser } from "@SchedulesManager/auth";
import { usePostHog } from "@posthog/react";
import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { authClient } from "./auth-client";
import { clearAuthIdentity, identifyAuthUser } from "./auth-listener";

export type AuthSession = { session: AuthSessionRecord; user: AuthUser };

type AuthContextValue = {
	isLoading: boolean;
	isSigningOut: boolean;
	session: AuthSession | null;
	user: AuthUser | null;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
	const queryClient = useQueryClient();
	const posthog = usePostHog();
	const { data: session, isPending: isLoading } = authClient.useSession();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const previousUserId = useRef<string | null>(null);

	useEffect(() => {
		const userId = session?.user.id ?? null;
		if (session?.user) identifyAuthUser(session.user, { posthog, queryClient });
		if (previousUserId.current && !userId)
			clearAuthIdentity({ posthog, queryClient });
		previousUserId.current = userId;
	}, [posthog, queryClient, session]);

	const value = useMemo<AuthContextValue>(
		() => ({
			isLoading,
			isSigningOut,
			session: session ?? null,
			user: session?.user ?? null,
			signOut: async () => {
				setIsSigningOut(true);
				try {
					posthog?.capture("user_signed_out");
					const { error } = await authClient.signOut();
					if (error) throw new Error(error.message ?? "Could not sign out.");
					clearAuthIdentity({ posthog, queryClient });
					previousUserId.current = null;
				} finally {
					setIsSigningOut(false);
				}
			},
		}),
		[isLoading, isSigningOut, posthog, queryClient, session],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used inside AuthProvider");
	return context;
}
