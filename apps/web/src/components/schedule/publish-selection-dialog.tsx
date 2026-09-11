import { Button } from "@SchedulesManager/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";

export interface PublishSelectionVersion {
	id: string;
	versionNumber: number;
	publishedAt: string;
	workers: number;
}

export interface PublishSelectionChanges {
	total: number;
	material: number;
	acceptancesRequired: number;
}

export interface PublishSelectionResult {
	publishedShiftIds: string[];
	version: PublishSelectionVersion;
	changes: PublishSelectionChanges;
}

/**
 * Confirms a partial publish. Publishes only the selected draft Shifts as a
 * successor Schedule Version; every other draft change stays unpublished.
 *
 * The orchestrator wires this into the schedule page by passing the current
 * selection as `shiftIds` and refreshing the schedule in `onPublished`.
 */
export function PublishSelectionDialog({
	open,
	onOpenChange,
	scheduleId,
	shiftIds,
	onPublished,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scheduleId: string;
	shiftIds: string[];
	onPublished?: (result: PublishSelectionResult) => void;
}) {
	const publish = useMutation({
		mutationFn: () =>
			api<PublishSelectionResult>(
				`/v1/schedules/${scheduleId}/publish-selection`,
				{ method: "POST", body: { shiftIds } },
			),
		onSuccess: (result) => {
			const count = result.publishedShiftIds.length;
			const acceptanceNote =
				result.changes.acceptancesRequired > 0
					? ` ${result.changes.acceptancesRequired} late change(s) need worker acceptance.`
					: "";
			toast.success(
				`Published ${count} shift${count === 1 ? "" : "s"} as version ${result.version.versionNumber}.${acceptanceNote}`,
			);
			onPublished?.(result);
			onOpenChange(false);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const count = shiftIds.length;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (publish.isPending) return;
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Publish selected shifts</DialogTitle>
					<DialogDescription>
						{count === 1
							? "1 shift will be published"
							: `${count} shifts will be published`}{" "}
						as a new Schedule Version. Other draft changes stay unpublished and
						invisible to workers.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={publish.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => publish.mutate()}
						disabled={publish.isPending || count === 0}
					>
						{publish.isPending ? <Spinner data-icon="inline-start" /> : null}
						Publish {count > 0 ? count : ""} shift{count === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
