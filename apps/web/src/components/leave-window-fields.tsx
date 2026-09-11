import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Textarea } from "@SchedulesManager/ui/components/textarea";

import { DatePicker } from "@/components/date-picker";
import { TimePicker } from "@/components/time-picker";
import {
	formatLeaveHours,
	leaveChargeMinutes,
	PAID_DAY_MINUTES,
} from "@/lib/leave";

export { leaveChargeMinutes };

export type LeaveTypeOption = { id: string; name: string; paid: boolean };

const DEFAULT_WEEKEND_DAYS = [0, 6];

/**
 * Client estimate for all-day requests that charge working days only. Falls
 * back to the shared helper for partial days, where per-day policy rules are
 * not applied here.
 */
function workingDayCharge(input: {
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number;
	endMinute: number;
	timeZone?: string;
	weekendDays?: number[];
}): number {
	if (!input.allDay) return leaveChargeMinutes(input);
	const start = Date.parse(`${input.startDate}T00:00:00Z`);
	const end = Date.parse(`${input.endDate}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
	const weekend = new Set(
		input.weekendDays?.length ? input.weekendDays : DEFAULT_WEEKEND_DAYS,
	);
	let days = 0;
	for (let time = start; time <= end; time += 86_400_000) {
		if (!weekend.has(new Date(time).getUTCDay())) days += 1;
	}
	return days * PAID_DAY_MINUTES;
}

export function LeaveWindowFields({
	leaveTypes,
	leaveTypeId,
	onLeaveTypeIdChange,
	startDate,
	endDate,
	onStartDateChange,
	onEndDateChange,
	allDay,
	onAllDayChange,
	startMinute,
	endMinute,
	onStartMinuteChange,
	onEndMinuteChange,
	reason,
	onReasonChange,
	remainingMinutes,
	idPrefix,
	timeZone,
	isEmergency,
	onIsEmergencyChange,
	documentsRequired,
	weekendDays,
	chargeWorkingDaysOnly,
}: {
	leaveTypes: LeaveTypeOption[];
	leaveTypeId: string;
	onLeaveTypeIdChange: (value: string) => void;
	startDate: string;
	endDate: string;
	onStartDateChange: (value: string) => void;
	onEndDateChange: (value: string) => void;
	allDay: boolean;
	onAllDayChange: (value: boolean) => void;
	startMinute: number;
	endMinute: number;
	onStartMinuteChange: (value: number) => void;
	onEndMinuteChange: (value: number) => void;
	reason: string;
	onReasonChange: (value: string) => void;
	remainingMinutes?: number;
	idPrefix: string;
	timeZone?: string;
	isEmergency?: boolean;
	onIsEmergencyChange?: (value: boolean) => void;
	documentsRequired?: boolean;
	weekendDays?: number[];
	chargeWorkingDaysOnly?: boolean;
}) {
	const charge = chargeWorkingDaysOnly
		? workingDayCharge({
				startDate,
				endDate,
				allDay,
				startMinute,
				endMinute,
				timeZone,
				weekendDays,
			})
		: leaveChargeMinutes({
				startDate,
				endDate,
				allDay,
				startMinute,
				endMinute,
				timeZone,
			});
	const selected = leaveTypes.find((type) => type.id === leaveTypeId);

	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor={`${idPrefix}-leave-type`}>Leave type</FieldLabel>
				<Select
					items={leaveTypes.map((type) => ({
						label: type.paid ? type.name : `${type.name} · unpaid`,
						value: type.id,
					}))}
					value={leaveTypeId}
					onValueChange={(value) => value && onLeaveTypeIdChange(value)}
				>
					<SelectTrigger id={`${idPrefix}-leave-type`} className="w-full">
						<SelectValue placeholder="Choose a leave type" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{leaveTypes.map((type) => (
								<SelectItem key={type.id} value={type.id}>
									{type.paid ? type.name : `${type.name} · unpaid`}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor={`${idPrefix}-start`}>From</FieldLabel>
					<DatePicker
						id={`${idPrefix}-start`}
						value={startDate}
						onValueChange={(value) => {
							onStartDateChange(value);
							if (!endDate || endDate < value) onEndDateChange(value);
						}}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={`${idPrefix}-end`}>Until</FieldLabel>
					<DatePicker
						id={`${idPrefix}-end`}
						value={endDate}
						onValueChange={onEndDateChange}
						disabled={(date) =>
							Boolean(startDate) && date < new Date(`${startDate}T00:00:00`)
						}
					/>
				</Field>
			</div>
			<Field orientation="horizontal" className="items-center">
				<Checkbox
					id={`${idPrefix}-all-day`}
					checked={allDay}
					onCheckedChange={(checked) => onAllDayChange(checked === true)}
				/>
				<FieldLabel htmlFor={`${idPrefix}-all-day`} className="font-normal">
					All day
				</FieldLabel>
			</Field>
			{allDay ? null : (
				<div className="grid gap-3 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={`${idPrefix}-from`}>Starts</FieldLabel>
						<TimePicker
							id={`${idPrefix}-from`}
							value={startMinute}
							onValueChange={onStartMinuteChange}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`${idPrefix}-until`}>Ends</FieldLabel>
						<TimePicker
							id={`${idPrefix}-until`}
							value={endMinute}
							onValueChange={onEndMinuteChange}
						/>
					</Field>
				</div>
			)}
			<Field>
				<FieldLabel htmlFor={`${idPrefix}-reason`}>
					Note shared with your workplace (optional)
				</FieldLabel>
				<Textarea
					id={`${idPrefix}-reason`}
					value={reason}
					onChange={(event) => onReasonChange(event.target.value)}
					placeholder="Doctor appointment, family travel…"
				/>
			</Field>
			{onIsEmergencyChange ? (
				<Field orientation="horizontal" className="items-start">
					<Checkbox
						id={`${idPrefix}-emergency`}
						checked={isEmergency === true}
						onCheckedChange={(checked) => onIsEmergencyChange(checked === true)}
					/>
					<div className="grid gap-1">
						<FieldLabel
							htmlFor={`${idPrefix}-emergency`}
							className="font-normal"
						>
							Emergency — request immediate review
						</FieldLabel>
						<FieldDescription>
							Flags this request for immediate manager review. Use only when
							waiting would cause serious harm.
						</FieldDescription>
					</div>
				</Field>
			) : null}
			{charge > 0 ? (
				<FieldDescription>
					Time off:{" "}
					{selected
						? `${formatLeaveHours(charge)} of ${selected.name}`
						: formatLeaveHours(charge)}
					{allDay
						? chargeWorkingDaysOnly
							? " (8 hours per working day)"
							: " (8 hours per day)"
						: ""}
					{remainingMinutes == null
						? "."
						: remainingMinutes >= charge
							? ` · ${formatLeaveHours(remainingMinutes)} remaining.`
							: ` · only ${formatLeaveHours(remainingMinutes)} remaining.`}
				</FieldDescription>
			) : null}
			{documentsRequired ? (
				<FieldDescription>
					A supporting document (PDF or image) will be required to approve this
					request.
				</FieldDescription>
			) : null}
		</FieldGroup>
	);
}
