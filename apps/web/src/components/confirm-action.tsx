import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Button } from "@SchedulesManager/ui/components/button";
import type { ComponentProps, ReactNode } from "react";

type ButtonProps = ComponentProps<typeof Button>;

export function ConfirmAction({
	trigger,
	title,
	description,
	confirmLabel,
	onConfirm,
	disabled,
	destructive = false,
	triggerVariant = "outline",
}: {
	trigger: ReactNode;
	title: string;
	description: ReactNode;
	confirmLabel: string;
	onConfirm: () => void;
	disabled?: boolean;
	destructive?: boolean;
	triggerVariant?: ButtonProps["variant"];
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				disabled={disabled}
				render={
					<Button size="sm" variant={triggerVariant} disabled={disabled} />
				}
			>
				{trigger}
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant={destructive ? "destructive" : "default"}
						onClick={onConfirm}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
