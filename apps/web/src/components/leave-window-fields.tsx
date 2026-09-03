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
import { formatLeaveHours, PAID_DAY_MINUTES } from "@/lib/leave";

export type LeaveTypeOption = { id: string; name: string; paid: boolean };

export function leaveChargeMinutes(input: {
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number;
	endMinute: number;
}): number {
	if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
		return 0;
	}
	if (input.allDay) {
		const start = Date.parse(`${input.startDate}T00:00:00Z`);
		const end = Date.parse(`${input.endDate}T00:00:00Z`);
		return (Math.round((end - start) / 86_400_000) + 1) * PAID_DAY_MINUTES;
	}
	if (input.startDate === input.endDate && input.startMinute >= input.endMinute) {
		return 0;
	}
	const start = Date.parse(`${input.startDate}T00:00:00Z`) + input.startMinute * 60_000;
	const end = Date.parse(`${input.endDate}T00:00:00Z`) + input.endMinute * 60_000;
	return Math.max(0, Math.round((end - start) / 60_000));
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
}) {
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
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
							Boolean(startDate) &&
							date < new Date(`${startDate}T00:00:00`)
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
					Note for the other person (optional)
				</FieldLabel>
				<Textarea
					id={`${idPrefix}-reason`}
					value={reason}
					onChange={(event) => onReasonChange(event.target.value)}
					placeholder="Doctor appointment, family travel…"
				/>
			</Field>
			{charge > 0 ? (
				<FieldDescription>
					{selected
						? `${formatLeaveHours(charge)} of ${selected.name}`
						: formatLeaveHours(charge)}
					{remainingMinutes == null
						? "."
						: remainingMinutes >= charge
							? ` · ${formatLeaveHours(remainingMinutes)} remaining.`
							: ` · only ${formatLeaveHours(remainingMinutes)} remaining.`}
				</FieldDescription>
			) : null}
		</FieldGroup>
	);
}
