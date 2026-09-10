import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@SchedulesManager/ui/components/sheet";
import { cn } from "@SchedulesManager/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Standard side sheet for create/edit forms. Keeps the underlying list in view
 * and gives the form room to breathe on small screens.
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
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className={cn("w-full sm:max-w-md", className)}
			>
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					{description ? (
						<SheetDescription>{description}</SheetDescription>
					) : null}
				</SheetHeader>
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6">
					{children}
				</div>
				{footer ? <SheetFooter>{footer}</SheetFooter> : null}
			</SheetContent>
		</Sheet>
	);
}
