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
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@SchedulesManager/ui/components/tooltip";
import { usePostHog } from "@posthog/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState } from "react";
import { toast } from "sonner";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { useInvalidateSchedule } from "@/components/schedule/use-schedule-invalidate";
import { api } from "@/lib/api";
import type { ChangePreviewResponse } from "@/lib/queries";

type ChangeRow = ChangePreviewResponse["changes"][number];

const changeHelper = createDataColumnHelper<ChangeRow>();
const changeColumns = changeHelper.columns([
	changeHelper.accessor("material", {
		header: "Kind",
		cell: ({ getValue }) =>
			getValue() ? <Badge variant="secondary">Material</Badge> : "—",
	}),
	changeHelper.accessor("summary", { header: "Change" }),
]);

const getChangeRowId = (row: ChangeRow, index: number) =>
	`${row.kind}-${row.summary}-${index}`;

/**
 * The Publish button plus the change-preview confirmation. Owns the preview
 * and publish mutations and the dialog's open state, so previewing or
 * confirming a publish never rerenders the schedule page.
 */
export const SchedulePublishControl = memo(function SchedulePublishControl({
	scheduleId,
	canPublish,
	latestVersionNumber,
	hasUnpublishedChanges,
	conflictCount,
	locationId,
	weekStart,
	teamId,
}: {
	scheduleId: string | undefined;
	canPublish: boolean;
	latestVersionNumber: number | null | undefined;
	hasUnpublishedChanges: boolean | undefined;
	conflictCount: number;
	locationId: string | undefined;
	weekStart: string;
	teamId: string | null;
}) {
	const posthog = usePostHog();
	const queryClient = useQueryClient();
	const invalidate = useInvalidateSchedule(locationId, weekStart, teamId);
	const [publishPreview, setPublishPreview] =
		useState<ChangePreviewResponse | null>(null);

	const previewPublish = useMutation({
		mutationFn: async () => {
			if (!scheduleId) throw new Error("No schedule loaded");
			return api<ChangePreviewResponse>(
				`/v1/schedules/${scheduleId}/change-preview`,
			);
		},
		onSuccess: (preview) => setPublishPreview(preview),
		onError: (error) => toast.error((error as Error).message),
	});

	const publish = useMutation({
		mutationFn: async () => {
			if (!scheduleId) throw new Error("No schedule loaded");
			return api<{
				version: { versionNumber: number; workers: number };
				changes: {
					total: number;
					material: number;
					acceptancesRequired: number;
				};
			}>(`/v1/schedules/${scheduleId}/publish`, { method: "POST" });
		},
		onSuccess: async (result) => {
			setPublishPreview(null);
			await invalidate();
			await queryClient.invalidateQueries({
				queryKey: ["acceptances", scheduleId],
			});
			// A new version re-links punches and republishes rollups.
			await queryClient.invalidateQueries({
				queryKey: ["schedule-timeclock", locationId, weekStart, teamId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["schedule-labor", locationId, weekStart, teamId],
			});
			await queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			await queryClient.invalidateQueries({ queryKey: ["notifications"] });
			posthog?.capture("schedule_published", {
				version_number: result.version.versionNumber,
				worker_count: result.version.workers,
				total_changes: result.changes.total,
				material_changes: result.changes.material,
				acceptances_required: result.changes.acceptancesRequired,
				week_start: weekStart,
			});
			const acceptanceNote =
				result.changes.acceptancesRequired > 0
					? ` ${result.changes.acceptancesRequired} late change(s) need worker acceptance.`
					: "";
			toast.success(
				`Published version ${result.version.versionNumber} to ${result.version.workers} worker(s).${acceptanceNote}`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const publishedAndUnchanged =
		latestVersionNumber != null && !hasUnpublishedChanges;

	return (
		<>
			<Tooltip>
				<TooltipTrigger
					render={
						<span className="inline-flex">
							<Button
								size="sm"
								disabled={
									!canPublish ||
									previewPublish.isPending ||
									!scheduleId ||
									publishedAndUnchanged
								}
								onClick={() => previewPublish.mutate()}
							>
								{previewPublish.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Publish
							</Button>
						</span>
					}
				/>
				{publishedAndUnchanged ? (
					<TooltipContent>
						This week is published and unchanged. Edit the schedule to start a
						new draft.
					</TooltipContent>
				) : null}
			</Tooltip>
			<AlertDialog
				open={publishPreview !== null}
				onOpenChange={(open) => {
					if (!open) setPublishPreview(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Publish this draft?</AlertDialogTitle>
						<AlertDialogDescription>
							{conflictCount > 0
								? `This draft has ${conflictCount} conflict(s). Publishing creates and sends a new immutable schedule version.`
								: "Publishing creates and sends a new immutable schedule version. Future edits begin the next draft."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{publishPreview?.hasPublishedVersion &&
					publishPreview.changes.length > 0 ? (
						<DataTable
							fill={false}
							bounded
							columns={changeColumns}
							data={publishPreview.changes}
							getRowId={getChangeRowId}
							className="[&_tbody_tr:last-child]:border-b-0"
						/>
					) : null}
					{publishPreview && publishPreview.wouldRequireAcceptance > 0 ? (
						<p className="text-muted-foreground text-xs">
							{publishPreview.wouldRequireAcceptance} change(s) start within the{" "}
							{publishPreview.noticeWindowHours}h notice window and will require
							worker acceptance.
						</p>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={publish.isPending}
							onClick={() => publish.mutate()}
						>
							{publish.isPending ? <Spinner data-icon="inline-start" /> : null}
							Publish now
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
});
