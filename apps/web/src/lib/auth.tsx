import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

import { supabase } from "./supabase";

type AuthContextValue = {
	isLoading: boolean;
	isSigningOut: boolean;
	session: Session | null;
	user: User | null;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
	const queryClient = useQueryClient();
	const [session, setSession] = useState<Session | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSigningOut, setIsSigningOut] = useState(false);

	useEffect(() => {
		let mounted = true;
		supabase.auth.getSession().then(({ data }) => {
			if (mounted) {
				setSession(data.session);
				setIsLoading(false);
			}
		});
		const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
			setSession(nextSession);
			setIsLoading(false);
		});
		return () => {
			mounted = false;
			data.subscription.unsubscribe();
		};
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			isLoading,
			isSigningOut,
			session,
			user: session?.user ?? null,
			signOut: async () => {
				setIsSigningOut(true);
				try {
					const { error } = await supabase.auth.signOut();
					if (error) throw error;
					setSession(null);
					queryClient.clear();
				} finally {
					setIsSigningOut(false);
				}
			},
		}),
		[isLoading, isSigningOut, queryClient, session],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth must be used inside AuthProvider");
	return context;
}
