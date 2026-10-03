import { Button } from "@SchedulesManager/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { FormSheet } from "@/components/form-sheet";
import {
	LeaveWindowFields,
	leaveChargeMinutes,
} from "@/components/leave-window-fields";
import { api } from "@/lib/api";
import { formatLeaveHours, todayIsoDate } from "@/lib/leave";
import type { LeaveTypeDto } from "@/lib/queries";
import {
	type LeaveRecurrenceFrequency,
	type LeaveRequestMode,
	type LeaveWindowRow,
	RECURRENCE_ITEMS,
	windowId,
} from "./shared";

/**
 * Time-off request form. Owns all of its draft state so typing here never
 * re-renders the tables behind it. Stays mounted after the first open so the
 * draft survives closing and reopening, as it did before.
 */
export default function RequestTimeOffSheet({
	open,
	onOpenChange,
	workplaceId,
	leaveTypes,
	balances,
	timeZone,
	onSubmitted,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workplaceId: string | undefined;
	leaveTypes: LeaveTypeDto[];
	balances: { leaveTypeId: string; minutes: number }[];
	timeZone: string | undefined;
	onSubmitted: () => void;
}) {
	const [offStartDate, setOffStartDate] = useState(todayIsoDate);
	const [offEndDate, setOffEndDate] = useState(todayIsoDate);
	const [offAllDay, setOffAllDay] = useState(true);
	const [offStart, setOffStart] = useState(9 * 60);
	const [offEnd, setOffEnd] = useState(17 * 60);
	const [offReason, setOffReason] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [requestMode, setRequestMode] = useState<LeaveRequestMode>("single");
	const [extraWindows, setExtraWindows] = useState<LeaveWindowRow[]>([]);
	const [recurrenceFrequency, setRecurrenceFrequency] =
		useState<LeaveRecurrenceFrequency>("weekly");
	const [recurrenceCount, setRecurrenceCount] = useState(4);
	const [offEmergency, setOffEmergency] = useState(false);
	function addWindowRow() {
		setExtraWindows((current) => [
			...current,
			{
				id: windowId(),
				startDate: todayIsoDate(),
				endDate: todayIsoDate(),
			},
		]);
	}

	function removeWindowRow(id: string) {
		setExtraWindows((current) => current.filter((row) => row.id !== id));
	}

	function updateWindowRow(id: string, patch: Partial<LeaveWindowRow>) {
		setExtraWindows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);
	}
	const requestTimeOff = useMutation({
		mutationFn: () => {
			const baseWindow = {
				startDate: offStartDate,
				endDate: offEndDate || offStartDate,
				allDay: offAllDay,
				...(offAllDay ? {} : { startMinute: offStart, endMinute: offEnd }),
				reason: offReason.trim() || undefined,
				leaveTypeId,
			};
			if (requestMode === "multiple") {
				const windows = [
					{
						id: "primary",
						startDate: offStartDate,
						endDate: offEndDate || offStartDate,
					},
					...extraWindows,
				];
				if (windows.some((row) => !row.startDate)) {
					throw new Error("Choose a start date for every window.");
				}
				return api<{ requests: { id: string }[] }>(
					`/v1/workplaces/${workplaceId}/my/time-off`,
					{
						method: "POST",
						body: {
							windows: windows.map((row) => ({
								...baseWindow,
								startDate: row.startDate,
								endDate: row.endDate || row.startDate,
							})),
							isEmergency: offEmergency,
						},
					},
				);
			}
			if (requestMode === "recurring") {
				return api<{ requests: { id: string }[] }>(
					`/v1/workplaces/${workplaceId}/my/time-off`,
					{
						method: "POST",
						body: {
							windows: [baseWindow],
							recurrence: {
								frequency: recurrenceFrequency,
								count: recurrenceCount,
							},
							isEmergency: offEmergency,
						},
					},
				);
			}
			if (!offStartDate) {
				throw new Error("Choose a start date.");
			}
			return api<{ requests: { id: string }[] }>(
				`/v1/workplaces/${workplaceId}/my/time-off`,
				{
					method: "POST",
					body: { ...baseWindow, isEmergency: offEmergency },
				},
			);
		},
		onSuccess: (result) => {
			const count = result.requests?.length ?? 1;
			setOffStartDate(todayIsoDate());
			setOffEndDate(todayIsoDate());
			setOffReason("");
			setExtraWindows([]);
			setOffEmergency(false);
			onSubmitted();
			toast.success(
				count > 1
					? `${count} time-off requests submitted. Your manager will review them.`
					: "Time off requested. Your manager will review it.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const selectedLeaveType = leaveTypes.find((type) => type.id === leaveTypeId);
	const remainingForType = balances.find(
		(balance) => balance.leaveTypeId === leaveTypeId,
	)?.minutes;

	const primaryCharge = leaveChargeMinutes({
		startDate: offStartDate,
		endDate: offEndDate || offStartDate,
		allDay: offAllDay,
		startMinute: offStart,
		endMinute: offEnd,
		timeZone,
	});

	return (
		<FormSheet
			open={open}
			onOpenChange={onOpenChange}
			title="Request time off"
			description="All-day by default. Your manager reviews every request before it blocks the schedule."
			footer={
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={requestTimeOff.isPending}
						onClick={() => {
							if (!leaveTypeId) {
								toast.error("Choose a leave type.");
								return;
							}
							if (
								requestMode === "recurring" &&
								(recurrenceCount < 2 || recurrenceCount > 26)
							) {
								toast.error("Repeat the request between 2 and 26 times.");
								return;
							}
							requestTimeOff.mutate(undefined, {
								onSuccess: () => onOpenChange(false),
							});
						}}
					>
						{requestTimeOff.isPending ? (
							<Spinner data-icon="inline-start" />
						) : null}
						Request time off
					</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-2">
				<span className="font-medium text-sm">Request type</span>
				<ToggleGroup
					aria-label="Request type"
					value={[requestMode]}
					variant="outline"
					size="sm"
					spacing={0}
					onValueChange={(value) => {
						const next = value[0];
						if (
							next === "single" ||
							next === "multiple" ||
							next === "recurring"
						) {
							setRequestMode(next);
						}
					}}
				>
					<ToggleGroupItem value="single">Single</ToggleGroupItem>
					<ToggleGroupItem value="multiple">Multiple days</ToggleGroupItem>
					<ToggleGroupItem value="recurring">Recurring</ToggleGroupItem>
				</ToggleGroup>
			</div>
			<LeaveWindowFields
				idPrefix="off"
				leaveTypes={leaveTypes}
				leaveTypeId={leaveTypeId}
				onLeaveTypeIdChange={setLeaveTypeId}
				startDate={offStartDate}
				endDate={offEndDate}
				onStartDateChange={setOffStartDate}
				onEndDateChange={setOffEndDate}
				allDay={offAllDay}
				onAllDayChange={setOffAllDay}
				startMinute={offStart}
				endMinute={offEnd}
				onStartMinuteChange={setOffStart}
				onEndMinuteChange={setOffEnd}
				reason={offReason}
				onReasonChange={setOffReason}
				remainingMinutes={remainingForType}
				timeZone={timeZone}
				isEmergency={offEmergency}
				onIsEmergencyChange={setOffEmergency}
				documentsRequired={Boolean(
					selectedLeaveType?.policy?.documentRequiredAfterDays,
				)}
				chargeWorkingDaysOnly={
					selectedLeaveType?.policy?.chargeWorkingDaysOnly ?? false
				}
			/>
			{requestMode === "multiple" ? (
				<FieldGroup className="gap-3">
					<div className="grid gap-1">
						<FieldLabel>Additional date ranges</FieldLabel>
						<FieldDescription>
							The window above plus these ranges are submitted together.
						</FieldDescription>
					</div>
					{extraWindows.map((row) => (
						<div
							key={row.id}
							className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
						>
							<DatePicker
								value={row.startDate}
								onValueChange={(value) =>
									updateWindowRow(row.id, {
										startDate: value,
										endDate:
											row.endDate && row.endDate >= value ? row.endDate : value,
									})
								}
							/>
							<DatePicker
								value={row.endDate}
								onValueChange={(value) =>
									updateWindowRow(row.id, { endDate: value })
								}
								disabled={(date) =>
									Boolean(row.startDate) &&
									date < new Date(`${row.startDate}T00:00:00`)
								}
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Remove date range"
								onClick={() => removeWindowRow(row.id)}
							>
								<XIcon />
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						className="self-start"
						onClick={addWindowRow}
					>
						<PlusIcon data-icon="inline-start" />
						Add date range
					</Button>
				</FieldGroup>
			) : null}
			{requestMode === "recurring" ? (
				<FieldGroup className="gap-3">
					<div className="grid gap-1">
						<FieldLabel>Repeats</FieldLabel>
						<FieldDescription>
							Repeats the window above from its start date. Up to 26
							occurrences.
						</FieldDescription>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="recurrence-frequency">Frequency</FieldLabel>
							<Select
								items={[...RECURRENCE_ITEMS]}
								value={recurrenceFrequency}
								onValueChange={(value) => {
									if (
										value === "weekly" ||
										value === "biweekly" ||
										value === "monthly"
									) {
										setRecurrenceFrequency(value);
									}
								}}
							>
								<SelectTrigger id="recurrence-frequency" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{RECURRENCE_ITEMS.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="recurrence-count">Occurrences</FieldLabel>
							<Input
								id="recurrence-count"
								type="number"
								min={2}
								max={26}
								value={recurrenceCount}
								onChange={(event) =>
									setRecurrenceCount(Number(event.target.value))
								}
							/>
						</Field>
					</div>
					{primaryCharge > 0 && recurrenceCount >= 2 ? (
						<FieldDescription>
							About {formatLeaveHours(primaryCharge * recurrenceCount)} across{" "}
							{recurrenceCount} windows.
						</FieldDescription>
					) : null}
				</FieldGroup>
			) : null}
		</FormSheet>
	);
}
