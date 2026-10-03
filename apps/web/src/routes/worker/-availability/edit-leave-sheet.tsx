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
import { useState } from "react";
import { toast } from "sonner";
import {
	LeaveWindowFields,
	leaveChargeMinutes,
} from "@/components/leave-window-fields";
import { api } from "@/lib/api";
import type { WorkerConstraints } from "@/lib/queries";

export default function WorkerEditLeaveSheet({
	request,
	workplaceId,
	timeZone,
	leaveTypes,
	balances,
	onOpenChange,
	onSaved,
}: {
	request: WorkerConstraints["timeOff"][number];
	workplaceId: string | undefined;
	timeZone?: string;
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: { leaveTypeId: string; minutes: number }[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [leaveTypeId, setLeaveTypeId] = useState(request.leaveTypeId ?? "");
	const [startDate, setStartDate] = useState(request.startDate);
	const [endDate, setEndDate] = useState(request.endDate);
	const [allDay, setAllDay] = useState(request.allDay);
	const [startMinute, setStartMinute] = useState(request.startMinute ?? 9 * 60);
	const [endMinute, setEndMinute] = useState(request.endMinute ?? 17 * 60);
	const [reason, setReason] = useState(request.reason ?? "");
	const remainingMinutes = balances.find(
		(balance) => balance.leaveTypeId === leaveTypeId,
	)?.minutes;
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
		timeZone,
	});
	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/time-off/${request.id}`, {
				method: "PATCH",
				body: {
					leaveTypeId,
					startDate,
					endDate,
					allDay,
					...(allDay ? {} : { startMinute, endMinute }),
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			onSaved();
			toast.success("Request updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[min(90dvh,48rem)] w-full flex-col overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Edit request</DialogTitle>
					<DialogDescription>
						Pending until your manager reviews it.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<LeaveWindowFields
						idPrefix="edit-off"
						leaveTypes={leaveTypes}
						leaveTypeId={leaveTypeId}
						onLeaveTypeIdChange={setLeaveTypeId}
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
						allDay={allDay}
						onAllDayChange={setAllDay}
						startMinute={startMinute}
						endMinute={endMinute}
						onStartMinuteChange={setStartMinute}
						onEndMinuteChange={setEndMinute}
						reason={reason}
						onReasonChange={setReason}
						remainingMinutes={remainingMinutes}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={save.isPending || !leaveTypeId || charge <= 0}
						onClick={() => save.mutate()}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
