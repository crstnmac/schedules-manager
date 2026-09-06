import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
import { useBlocker } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

const UnsavedChangesContext = createContext<{
	register: (key: string, dirty: boolean) => void;
} | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
	const [dirtyCount, setDirtyCount] = useState(0);
	const registry = useRef<Map<string, boolean>>(new Map());

	const register = useMemo(
		() => (key: string, dirty: boolean) => {
			const previous = registry.current.get(key);
			if (previous === dirty) return;
			registry.current.set(key, dirty);
			let count = 0;
			for (const isDirty of registry.current.values()) {
				if (isDirty) count += 1;
			}
			setDirtyCount(count);
		},
		[],
	);

	const value = useMemo(() => ({ register }), [register]);

	return (
		<UnsavedChangesContext.Provider value={value}>
			{children}
			<UnsavedChangesGuard when={dirtyCount > 0} />
		</UnsavedChangesContext.Provider>
	);
}

export function useRegisterUnsavedChanges(key: string, dirty: boolean) {
	const context = useContext(UnsavedChangesContext);
	useEffect(() => {
		if (!context) return;
		context.register(key, dirty);
		return () => context.register(key, false);
	}, [context, key, dirty]);
}

export function UnsavedChangesGuard({ when }: { when: boolean }) {
	const blocker = useBlocker({
		shouldBlockFn: () => when,
		enableBeforeUnload: true,
		withResolver: true,
	});

	const blocked = blocker.status === "blocked";

	return (
		<AlertDialog
			open={blocked}
			onOpenChange={(open) => {
				if (!open) blocker.reset?.();
			}}
		>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
					<AlertDialogDescription>
						Your changes haven’t been saved yet. Leaving this page now will
						discard them.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => blocker.reset?.()}>
						Keep editing
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={() => blocker.proceed?.()}
					>
						Discard changes
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
