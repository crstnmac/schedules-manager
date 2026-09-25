import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import { cn } from "@SchedulesManager/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Standard dialog for create/edit forms, with a scrollable body and visible actions.
 */
export function FormSheet({
	open,
	onOpenChange,
	title,
	description,
	children,
	footer,
	className,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"flex max-h-[min(90dvh,48rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
					className,
				)}
			>
				<DialogHeader className="shrink-0 px-6 py-5 pr-12">
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
					{children}
				</div>
				{footer ? (
					<DialogFooter className="mx-0 mb-0 shrink-0 rounded-none bg-background">
						{footer}
					</DialogFooter>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
