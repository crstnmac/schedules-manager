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
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { memo, useMemo } from "react";
import {
	type PositionApproval,
	positionApprovalCopy,
} from "@/components/schedule/shift-form";

/** Confirms adding a Position to a worker's Employment before a save or move. */
export const PositionApprovalDialog = memo(function PositionApprovalDialog({
	approval,
	pending,
	onConfirm,
	onClose,
}: {
	approval: PositionApproval | null;
	pending: boolean;
	onConfirm: (approval: PositionApproval) => void;
	onClose: () => void;
}) {
	const copy = useMemo(
		() => (approval ? positionApprovalCopy(approval) : null),
		[approval],
	);
	return (
		<AlertDialog
			open={approval !== null}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<AlertDialogContent className="sm:max-w-md">
				{approval && copy ? (
					<>
						<AlertDialogHeader>
							<AlertDialogTitle>{copy.title}</AlertDialogTitle>
							<AlertDialogDescription>
								{copy.description}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
							<AlertDialogAction
								disabled={pending}
								onClick={(event) => {
									event.preventDefault();
									onConfirm(approval);
								}}
							>
								{pending ? <Spinner data-icon="inline-start" /> : null}
								{copy.confirmLabel}
							</AlertDialogAction>
						</AlertDialogFooter>
					</>
				) : null}
			</AlertDialogContent>
		</AlertDialog>
	);
});
