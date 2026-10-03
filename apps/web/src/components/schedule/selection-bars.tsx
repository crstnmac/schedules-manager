import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { useMutation } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { formatDayLabel } from "@/components/schedule/format";
import {
	type ShiftSelectionStore,
	useShiftSelectionIds,
} from "@/components/schedule/selection-store";
import { useInvalidateSchedule } from "@/components/schedule/use-schedule-invalidate";
import { api } from "@/lib/api";
import type { ScheduleResponse } from "@/lib/queries";

const BulkEditDialog = lazy(() =>
	import("@/components/schedule/bulk-edit-dialog").then((m) => ({
		default: m.BulkEditDialog,
	})),
);
const PublishSelectionDialog = lazy(() =>
	import("@/components/schedule/publish-selection-dialog").then((m) => ({
		default: m.PublishSelectionDialog,
	})),
);

interface CopiedShift {
	positionId: string;
	startMinute: number;
	endMinute: number;
	note: string | null;
}

/**
 * The "N shifts copied / paste onto day" bar and the "N selected" bulk bar,
 * plus the bulk-edit and publish-selection dialogs they open. It subscribes to
 * the selection store itself and owns the copied-shift clipboard, the open
 * state and the bulk/paste mutations, so selecting shifts or opening a dialog
 * never rerenders the schedule page.
 */
export const ScheduleSelectionBars = memo(function ScheduleSelectionBars({
	store,
	shifts,
	staff,
	hasData,
	scheduleId,
	locationId,
	weekStart,
	teamId,
	days,
	showPaste,
	canManage,
	canPublish,
}: {
	store: ShiftSelectionStore;
	shifts: ScheduleResponse["shifts"] | undefined;
	staff: ScheduleResponse["staff"] | undefined;
	hasData: boolean;
	scheduleId: string | undefined;
	locationId: string | undefined;
	weekStart: string;
	teamId: string | null;
	days: string[];
	/** The paste bar is hidden in the month view. */
	showPaste: boolean;
	canManage: boolean;
	canPublish: boolean;
}) {
	const selectedShiftIds = useShiftSelectionIds(store);
	const invalidate = useInvalidateSchedule(locationId, weekStart, teamId);
	const [copiedShifts, setCopiedShifts] = useState<CopiedShift[]>([]);
	const [bulkEditOpen, setBulkEditOpen] = useState(false);
	const [publishSelectionOpen, setPublishSelectionOpen] = useState(false);

	const bulkShifts = useMutation({
		mutationFn: (body: {
			shiftIds: string[];
			delete?: boolean;
			employmentId?: string | null;
		}) =>
			api(`/v1/locations/${locationId}/schedules/${weekStart}/bulk`, {
				method: "POST",
				body: { ...body, teamId },
			}),
		onSuccess: async () => {
			store.clear();
			await invalidate();
			toast.success("Bulk change saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const pasteShifts = useMutation({
		mutationFn: (date: string) =>
			api<{ pasted: number }>(
				`/v1/locations/${locationId}/schedules/${weekStart}/paste`,
				{
					method: "POST",
					body: { date, shifts: copiedShifts, teamId },
				},
			),
		onSuccess: async (result: { pasted: number }) => {
			await invalidate();
			toast.success(
				`Pasted ${result.pasted} Shift${result.pasted === 1 ? "" : "s"}.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const handleBulkEdited = useCallback(() => {
		store.clear();
		void invalidate();
	}, [store, invalidate]);
	const handlePublished = handleBulkEdited;

	const pasteItems = useMemo(
		() => [
			{ label: "Paste onto day", value: null },
			...days.map((day) => ({ label: formatDayLabel(day), value: day })),
		],
		[days],
	);
	const bulkWorkers = useMemo(
		() =>
			(staff ?? []).map((member) => ({
				employmentId: member.employmentId,
				name: member.name || member.email,
			})),
		[staff],
	);

	const copySelected = () => {
		const picked = (shifts ?? []).filter((shift) =>
			selectedShiftIds.includes(shift.id),
		);
		setCopiedShifts(
			picked.map((shift) => ({
				positionId: shift.positionId,
				startMinute: shift.startMinute,
				endMinute: shift.endMinute,
				note: shift.note,
			})),
		);
		toast.success("Shifts copied.");
	};

	return (
		<>
			{copiedShifts.length > 0 && showPaste ? (
				<div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 print:hidden">
					<span className="text-muted-foreground text-xs tabular-nums">
						{copiedShifts.length} shift
						{copiedShifts.length === 1 ? "" : "s"} copied
					</span>
					<Select
						items={pasteItems}
						value={null}
						onValueChange={(value) => {
							if (value) pasteShifts.mutate(value);
						}}
					>
						<SelectTrigger aria-label="Paste copied shifts onto a day">
							<SelectValue placeholder="Paste onto day" />
						</SelectTrigger>
						<SelectContent alignItemWithTrigger={false}>
							<SelectGroup>
								{days.map((day) => (
									<SelectItem key={day} value={day}>
										{formatDayLabel(day)}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Button size="sm" variant="ghost" onClick={() => setCopiedShifts([])}>
						Clear
					</Button>
				</div>
			) : null}

			{selectedShiftIds.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 print:hidden">
					<Badge variant="secondary" className="tabular-nums">
						{selectedShiftIds.length} selected
					</Badge>
					<Button
						size="sm"
						variant="outline"
						disabled={!canManage || !hasData || bulkShifts.isPending}
						onClick={() => setBulkEditOpen(true)}
					>
						Bulk edit
					</Button>
					<Button size="sm" variant="outline" onClick={copySelected}>
						Copy
					</Button>
					<ConfirmAction
						trigger="Delete"
						triggerVariant="destructive"
						destructive
						title={`Delete ${selectedShiftIds.length} selected ${selectedShiftIds.length === 1 ? "shift" : "shifts"}?`}
						description="This removes them from the draft. Publish to let the team see the change."
						confirmLabel="Delete shifts"
						disabled={!canManage || bulkShifts.isPending}
						onConfirm={() =>
							bulkShifts.mutate({
								shiftIds: selectedShiftIds,
								delete: true,
							})
						}
					/>
					<Button
						size="sm"
						variant="outline"
						disabled={!canPublish || !scheduleId}
						onClick={() => setPublishSelectionOpen(true)}
					>
						<SendIcon data-icon="inline-start" />
						Publish selected
					</Button>
					<Button size="sm" variant="ghost" onClick={store.clear}>
						Clear
					</Button>
					<p className="text-muted-foreground text-xs">
						Shift-click or ⌘-click a shift to select.
					</p>
				</div>
			) : null}

			<Suspense fallback={null}>
				<PublishSelectionDialog
					open={publishSelectionOpen}
					onOpenChange={setPublishSelectionOpen}
					scheduleId={scheduleId ?? ""}
					shiftIds={selectedShiftIds}
					onPublished={handlePublished}
				/>
				<BulkEditDialog
					open={bulkEditOpen}
					onOpenChange={setBulkEditOpen}
					locationId={locationId}
					weekStart={weekStart}
					shiftIds={selectedShiftIds}
					workers={bulkWorkers}
					teamId={teamId}
					onEdited={handleBulkEdited}
				/>
			</Suspense>
		</>
	);
});
