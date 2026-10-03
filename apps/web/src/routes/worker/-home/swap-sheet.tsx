import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
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
import { ArrowLeftRightIcon, CheckIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import type {
	DayRosterEntry,
	useDayRoster,
	useProposeSwap,
} from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useStablePrefs } from "../-shared/use-stable-prefs";
import type { WorkerShift } from "./shared";

const coworkerHelper = createDataColumnHelper<DayRosterEntry>();
const coworkerRowId = (row: DayRosterEntry) => row.versionShiftId;

export default function SwapSheet({
	shift,
	open,
	onOpenChange,
	roster,
	proposeSwap,
}: {
	shift: WorkerShift | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	roster: ReturnType<typeof useDayRoster>;
	proposeSwap: ReturnType<typeof useProposeSwap>;
}) {
	const { formatClockTime, formatShiftRange } = useStablePrefs();
	const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
	const rosterRows = roster.data?.roster;
	const coworkers = useMemo(
		() =>
			(rosterRows ?? []).filter(
				(row) =>
					!row.mine &&
					row.employmentId !== null &&
					new Date(row.startsAt).getTime() > Date.now(),
			),
		[rosterRows],
	);
	const selected = coworkers.find(
		(row) => row.versionShiftId === selectedShiftId,
	);
	const coworkerColumns = useMemo(
		() =>
			coworkerHelper.columns([
				coworkerHelper.accessor("workerName", {
					header: "Worker",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				coworkerHelper.accessor(
					(row) =>
						`${formatClockTime(row.startsAt, row.timezone)}–${formatClockTime(row.endsAt, row.timezone)}`,
					{
						id: "window",
						header: "Shift",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
				coworkerHelper.accessor("positionName", { header: "Position" }),
				coworkerHelper.display({
					id: "select",
					header: "Select",
					enableSorting: false,
					cell: ({ row }) => {
						const isSelected = selectedShiftId === row.original.versionShiftId;
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									variant={isSelected ? "secondary" : "outline"}
									onClick={() =>
										setSelectedShiftId(row.original.versionShiftId)
									}
								>
									{isSelected ? <CheckIcon data-icon="inline-start" /> : null}
									{isSelected ? "Selected" : "Select"}
								</Button>
							</div>
						);
					},
				}),
			]),
		[formatClockTime, selectedShiftId],
	);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) setSelectedShiftId(null);
			onOpenChange(nextOpen);
		},
		[onOpenChange],
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="flex max-h-[min(36rem,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
				<DialogHeader className="border-b px-6 py-4 pr-12">
					<DialogTitle>Propose a shift swap</DialogTitle>
					<DialogDescription>
						{shift
							? `You give ${formatDay(shift.startsAt)}, ${formatShiftRange(
									shift.startMinute,
									shift.endMinute,
									shift.overnight,
								)} · ${shift.positionName}`
							: "Choose a coworker's shift to exchange."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
					{roster.isLoading ? (
						<div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
							<Spinner /> Loading coworker shifts…
						</div>
					) : null}
					{roster.isError ? (
						<Alert variant="destructive">
							<AlertTitle>Couldn’t load coworker shifts</AlertTitle>
							<AlertDescription>
								{(roster.error as Error).message}
							</AlertDescription>
						</Alert>
					) : null}
					{!roster.isLoading && !roster.isError ? (
						<DataTable
							stacked
							fill={false}
							columns={coworkerColumns}
							data={coworkers}
							getRowId={coworkerRowId}
							className="[&_tbody_tr:last-child]:border-b-0"
							empty={
								<p className="text-muted-foreground text-sm">
									No coworkers have an eligible shift on this day.
								</p>
							}
						/>
					) : null}
				</div>

				<DialogFooter className="mx-0 mb-0 rounded-none border-t px-6 py-4">
					<Button
						disabled={
							!shift || !selected?.employmentId || proposeSwap.isPending
						}
						onClick={() => {
							if (!shift || !selected?.employmentId) return;
							proposeSwap.mutate(
								{
									requesterShiftId: shift.id,
									counterpartEmploymentId: selected.employmentId,
									counterpartShiftId: selected.versionShiftId,
								},
								{
									onSuccess: () => {
										toast.success(`Swap proposed to ${selected.workerName}.`);
										onOpenChange(false);
									},
									onError: (error) => toast.error((error as Error).message),
								},
							);
						}}
					>
						{proposeSwap.isPending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<ArrowLeftRightIcon data-icon="inline-start" />
						)}
						Send swap proposal
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
