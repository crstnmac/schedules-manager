import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CalendarClockIcon,
	GitBranchIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import { hoursToMinutes, minutesToHoursInput } from "@/lib/leave";
import {
	type ApprovalChainDto,
	type ApprovalChainStepDto,
	type LeavePolicyDto,
	type LeaveTypeDto,
	useApprovalChains,
	useDeleteApprovalChain,
	useLeaveTypes,
	useSaveApprovalChain,
	useUpsertLeavePolicy,
	useWorkers,
} from "@/lib/queries";
import { WEEKDAY_NAMES } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

type AccrualMethod = LeavePolicyDto["accrualMethod"];

const ACCRUAL_METHOD_ITEMS = [
	{ label: "No accrual", value: "none" },
	{ label: "Weekly", value: "weekly" },
	{ label: "Every two weeks", value: "biweekly" },
	{ label: "Twice a month", value: "semimonthly" },
	{ label: "Monthly", value: "monthly" },
	{ label: "Annually", value: "annual" },
	{ label: "Per hour worked", value: "per_hour_worked" },
] as const;

const ACCRUAL_METHOD_LABELS: Record<AccrualMethod, string> = {
	none: "None",
	weekly: "weekly",
	biweekly: "biweekly",
	semimonthly: "twice a month",
	monthly: "monthly",
	annual: "annually",
	per_hour_worked: "per hour worked",
};

const WEEKDAY_ITEMS = WEEKDAY_NAMES.map((label, value) => ({
	label,
	value: String(value),
}));

const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

function isMonthDay(value: string): boolean {
	if (!/^\d{2}-\d{2}$/.test(value)) return false;
	const month = Number(value.slice(0, 2));
	const day = Number(value.slice(3, 5));
	return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function integerOr(input: string, fallback: number): number {
	const value = Number(input);
	return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function nullableInteger(input: string): number | null {
	const trimmed = input.trim();
	if (trimmed === "") return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function nullableMinutes(input: string): number | null {
	return input.trim() === "" ? null : hoursToMinutes(input);
}

type PolicyForm = {
	accrualMethod: AccrualMethod;
	accrualHours: string;
	accrualDay: string;
	accrualWeekday: string;
	annualAccrualMonthDay: string;
	accrualPerHoursWorked: string;
	prorateOnJoin: boolean;
	maxBalanceHours: string;
	carryForwardEnabled: boolean;
	maxCarryForwardHours: string;
	carryForwardExpiryMonths: string;
	allowNegative: boolean;
	maxNegativeHours: string;
	chargeWorkingDaysOnly: boolean;
	minServiceDays: string;
	noticeDays: string;
	maxConsecutiveDays: string;
	documentRequiredAfterDays: string;
	encashmentEnabled: boolean;
	maxEncashmentHoursPerYear: string;
	allowPartialDays: boolean;
	leaveYearStartMonthDay: string;
};

function emptyPolicyForm(): PolicyForm {
	return {
		accrualMethod: "none",
		accrualHours: "",
		accrualDay: "1",
		accrualWeekday: "0",
		annualAccrualMonthDay: "",
		accrualPerHoursWorked: "40",
		prorateOnJoin: true,
		maxBalanceHours: "",
		carryForwardEnabled: false,
		maxCarryForwardHours: "",
		carryForwardExpiryMonths: "",
		allowNegative: false,
		maxNegativeHours: "",
		chargeWorkingDaysOnly: true,
		minServiceDays: "0",
		noticeDays: "0",
		maxConsecutiveDays: "",
		documentRequiredAfterDays: "",
		encashmentEnabled: false,
		maxEncashmentHoursPerYear: "",
		allowPartialDays: true,
		leaveYearStartMonthDay: "01-01",
	};
}

function policyToForm(policy: LeavePolicyDto | null): PolicyForm {
	if (!policy) return emptyPolicyForm();
	return {
		accrualMethod: policy.accrualMethod,
		accrualHours:
			policy.accrualMinutes > 0
				? minutesToHoursInput(policy.accrualMinutes)
				: "",
		accrualDay: String(policy.accrualDay),
		accrualWeekday: String(policy.accrualWeekday),
		annualAccrualMonthDay: policy.annualAccrualMonthDay ?? "",
		accrualPerHoursWorked: String(policy.accrualPerHoursWorked),
		prorateOnJoin: policy.prorateOnJoin,
		maxBalanceHours:
			policy.maxBalanceMinutes == null
				? ""
				: minutesToHoursInput(policy.maxBalanceMinutes),
		carryForwardEnabled: policy.carryForwardEnabled,
		maxCarryForwardHours:
			policy.maxCarryForwardMinutes == null
				? ""
				: minutesToHoursInput(policy.maxCarryForwardMinutes),
		carryForwardExpiryMonths:
			policy.carryForwardExpiryMonths == null
				? ""
				: String(policy.carryForwardExpiryMonths),
		allowNegative: policy.allowNegative,
		maxNegativeHours: minutesToHoursInput(policy.maxNegativeMinutes),
		chargeWorkingDaysOnly: policy.chargeWorkingDaysOnly,
		minServiceDays: String(policy.minServiceDays),
		noticeDays: String(policy.noticeDays),
		maxConsecutiveDays:
			policy.maxConsecutiveDays == null
				? ""
				: String(policy.maxConsecutiveDays),
		documentRequiredAfterDays:
			policy.documentRequiredAfterDays == null
				? ""
				: String(policy.documentRequiredAfterDays),
		encashmentEnabled: policy.encashmentEnabled,
		maxEncashmentHoursPerYear:
			policy.maxEncashmentMinutesPerYear == null
				? ""
				: minutesToHoursInput(policy.maxEncashmentMinutesPerYear),
		allowPartialDays: policy.allowPartialDays,
		leaveYearStartMonthDay: policy.leaveYearStartMonthDay,
	};
}

function policyFormValid(form: PolicyForm): boolean {
	if (!isMonthDay(form.leaveYearStartMonthDay.trim())) return false;
	if (form.accrualMethod === "annual") {
		if (!isMonthDay(form.annualAccrualMonthDay.trim())) return false;
	}
	if (form.accrualMethod === "per_hour_worked") {
		return (
			hoursToMinutes(form.accrualHours) > 0 &&
			integerOr(form.accrualPerHoursWorked, 0) >= 1
		);
	}
	if (form.accrualMethod === "none") return true;
	return hoursToMinutes(form.accrualHours) > 0;
}

function policyBodyFromForm(form: PolicyForm): Partial<LeavePolicyDto> {
	const method = form.accrualMethod;
	const perHoursWorked = integerOr(form.accrualPerHoursWorked, 0);
	return {
		accrualMethod: method,
		accrualMinutes: hoursToMinutes(form.accrualHours),
		accrualDay: Math.min(28, Math.max(1, integerOr(form.accrualDay, 1))),
		accrualWeekday: Math.min(6, Math.max(0, integerOr(form.accrualWeekday, 0))),
		annualAccrualMonthDay: form.annualAccrualMonthDay.trim() || null,
		accrualPerHoursWorked:
			method === "per_hour_worked" && perHoursWorked >= 1
				? perHoursWorked
				: undefined,
		prorateOnJoin: form.prorateOnJoin,
		maxBalanceMinutes: nullableMinutes(form.maxBalanceHours),
		carryForwardEnabled: form.carryForwardEnabled,
		maxCarryForwardMinutes: nullableMinutes(form.maxCarryForwardHours),
		carryForwardExpiryMonths: nullableInteger(form.carryForwardExpiryMonths),
		allowNegative: form.allowNegative,
		maxNegativeMinutes: form.allowNegative
			? hoursToMinutes(form.maxNegativeHours)
			: 0,
		chargeWorkingDaysOnly: form.chargeWorkingDaysOnly,
		minServiceDays: integerOr(form.minServiceDays, 0),
		noticeDays: integerOr(form.noticeDays, 0),
		maxConsecutiveDays: nullableInteger(form.maxConsecutiveDays),
		documentRequiredAfterDays: nullableInteger(form.documentRequiredAfterDays),
		encashmentEnabled: form.encashmentEnabled,
		maxEncashmentMinutesPerYear: nullableMinutes(
			form.maxEncashmentHoursPerYear,
		),
		allowPartialDays: form.allowPartialDays,
		leaveYearStartMonthDay: form.leaveYearStartMonthDay.trim() || "01-01",
	};
}

function PolicyToggle({
	id,
	label,
	description,
	checked,
	onCheckedChange,
}: {
	id: string;
	label: string;
	description?: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<Field orientation="horizontal" className="items-start">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(value) => onCheckedChange(value === true)}
			/>
			<div className="grid gap-0.5">
				<FieldLabel htmlFor={id} className="font-normal">
					{label}
				</FieldLabel>
				{description ? (
					<FieldDescription>{description}</FieldDescription>
				) : null}
			</div>
		</Field>
	);
}

/**
 * Editor for a single Leave Type policy. Shared by the Leave types card and
 * the Leave policies card so both entry points stay identical.
 */
export function LeavePolicySheet({
	workplaceId,
	leaveType,
	open,
	onOpenChange,
}: {
	workplaceId: string | undefined;
	leaveType: LeaveTypeDto | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [form, setForm] = useState<PolicyForm>(emptyPolicyForm);
	const upsert = useUpsertLeavePolicy(workplaceId);

	useEffect(() => {
		if (open && leaveType) setForm(policyToForm(leaveType.policy));
	}, [open, leaveType]);

	const patch = (partial: Partial<PolicyForm>) =>
		setForm((current) => ({ ...current, ...partial }));

	const canSave = Boolean(workplaceId && leaveType && policyFormValid(form));

	const submit = () => {
		if (!leaveType) return;
		upsert.mutate(
			{ leaveTypeId: leaveType.id, ...policyBodyFromForm(form) },
			{
				onSuccess: () => {
					onOpenChange(false);
					toast.success("Leave policy saved.");
				},
				onError: (error) => toast.error((error as Error).message),
			},
		);
	};

	return (
		<SettingsFormSheet
			open={open}
			onOpenChange={onOpenChange}
			title={leaveType ? `Policy rules · ${leaveType.name}` : "Policy rules"}
			description="Accrual, carry-forward, and request limits for this leave type."
			footer={
				<div className={sheetFooterClassName}>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="leave-policy-form"
						disabled={!canSave || upsert.isPending}
					>
						{upsert.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save policy
					</Button>
				</div>
			}
		>
			<form
				id="leave-policy-form"
				className="flex flex-col gap-5"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<p className="text-muted-foreground text-sm">
					A leave type without a policy keeps legacy behavior: no accrual,
					calendar-day charging, and no balance limits.
				</p>

				<FieldGroup>
					<FieldTitle>Accrual</FieldTitle>
					<Field>
						<FieldLabel htmlFor="policy-accrual-method">
							Accrual method
						</FieldLabel>
						<Select
							items={[...ACCRUAL_METHOD_ITEMS]}
							value={form.accrualMethod}
							onValueChange={(value) => {
								if (value) patch({ accrualMethod: value as AccrualMethod });
							}}
						>
							<SelectTrigger id="policy-accrual-method" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectGroup>
									{ACCRUAL_METHOD_ITEMS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					{form.accrualMethod === "weekly" ||
					form.accrualMethod === "biweekly" ? (
						<Field>
							<FieldLabel htmlFor="policy-accrual-weekday">
								Accrual weekday
							</FieldLabel>
							<Select
								items={WEEKDAY_ITEMS}
								value={form.accrualWeekday}
								onValueChange={(value) => {
									if (value) patch({ accrualWeekday: value });
								}}
							>
								<SelectTrigger id="policy-accrual-weekday" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									<SelectGroup>
										{WEEKDAY_ITEMS.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
					) : null}
					{form.accrualMethod === "monthly" ||
					form.accrualMethod === "semimonthly" ? (
						<Field>
							<FieldLabel htmlFor="policy-accrual-day">Accrual day</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="policy-accrual-day"
									type="number"
									min={1}
									max={28}
									value={form.accrualDay}
									onChange={(event) =>
										patch({ accrualDay: event.target.value })
									}
								/>
								<InputGroupAddon align="inline-end">day</InputGroupAddon>
							</InputGroup>
							<FieldDescription>Day of the month, 1–28.</FieldDescription>
						</Field>
					) : null}
					{form.accrualMethod === "annual" ? (
						<Field>
							<FieldLabel htmlFor="policy-annual-day">Accrual date</FieldLabel>
							<Input
								id="policy-annual-day"
								placeholder="01-01"
								maxLength={5}
								value={form.annualAccrualMonthDay}
								onChange={(event) =>
									patch({ annualAccrualMonthDay: event.target.value })
								}
							/>
							<FieldDescription>Month and day, as MM-DD.</FieldDescription>
						</Field>
					) : null}
					{form.accrualMethod === "per_hour_worked" ? (
						<Field>
							<FieldLabel htmlFor="policy-per-hours">
								Hours worked per grant
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="policy-per-hours"
									type="number"
									min={1}
									max={10000}
									value={form.accrualPerHoursWorked}
									onChange={(event) =>
										patch({ accrualPerHoursWorked: event.target.value })
									}
								/>
								<InputGroupAddon align="inline-end">hours</InputGroupAddon>
							</InputGroup>
							<FieldDescription>
								Each time this many hours are worked, the grant below is added.
							</FieldDescription>
						</Field>
					) : null}
					{form.accrualMethod !== "none" ? (
						<Field>
							<FieldLabel htmlFor="policy-accrual-hours">
								{form.accrualMethod === "per_hour_worked"
									? "Grant amount"
									: "Accrual amount"}
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="policy-accrual-hours"
									type="number"
									min={0}
									step={0.5}
									value={form.accrualHours}
									onChange={(event) =>
										patch({ accrualHours: event.target.value })
									}
								/>
								<InputGroupAddon align="inline-end">hours</InputGroupAddon>
							</InputGroup>
						</Field>
					) : null}
					<PolicyToggle
						id="policy-prorate"
						label="Prorate on join"
						description="First accrual is reduced for the time before the join date."
						checked={form.prorateOnJoin}
						onCheckedChange={(checked) => patch({ prorateOnJoin: checked })}
					/>
				</FieldGroup>

				<FieldGroup>
					<FieldTitle>Balance limits</FieldTitle>
					<Field>
						<FieldLabel htmlFor="policy-max-balance">
							Maximum balance
						</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id="policy-max-balance"
								type="number"
								min={0}
								step={0.5}
								placeholder="No limit"
								value={form.maxBalanceHours}
								onChange={(event) =>
									patch({ maxBalanceHours: event.target.value })
								}
							/>
							<InputGroupAddon align="inline-end">hours</InputGroupAddon>
						</InputGroup>
						<FieldDescription>Leave blank for no limit.</FieldDescription>
					</Field>
					<PolicyToggle
						id="policy-carry-forward"
						label="Carry forward"
						description="Unused minutes move into the next leave year."
						checked={form.carryForwardEnabled}
						onCheckedChange={(checked) =>
							patch({ carryForwardEnabled: checked })
						}
					/>
					{form.carryForwardEnabled ? (
						<>
							<Field>
								<FieldLabel htmlFor="policy-carry-max">
									Maximum carry-forward
								</FieldLabel>
								<InputGroup>
									<InputGroupInput
										id="policy-carry-max"
										type="number"
										min={0}
										step={0.5}
										placeholder="No limit"
										value={form.maxCarryForwardHours}
										onChange={(event) =>
											patch({ maxCarryForwardHours: event.target.value })
										}
									/>
									<InputGroupAddon align="inline-end">hours</InputGroupAddon>
								</InputGroup>
							</Field>
							<Field>
								<FieldLabel htmlFor="policy-carry-expiry">
									Carry-forward expires after
								</FieldLabel>
								<InputGroup>
									<InputGroupInput
										id="policy-carry-expiry"
										type="number"
										min={0}
										max={60}
										placeholder="Never"
										value={form.carryForwardExpiryMonths}
										onChange={(event) =>
											patch({
												carryForwardExpiryMonths: event.target.value,
											})
										}
									/>
									<InputGroupAddon align="inline-end">months</InputGroupAddon>
								</InputGroup>
							</Field>
						</>
					) : null}
					<PolicyToggle
						id="policy-allow-negative"
						label="Allow negative balance"
						description="Requests can be approved below zero."
						checked={form.allowNegative}
						onCheckedChange={(checked) => patch({ allowNegative: checked })}
					/>
					{form.allowNegative ? (
						<Field>
							<FieldLabel htmlFor="policy-max-negative">
								Maximum negative balance
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="policy-max-negative"
									type="number"
									min={0}
									step={0.5}
									value={form.maxNegativeHours}
									onChange={(event) =>
										patch({ maxNegativeHours: event.target.value })
									}
								/>
								<InputGroupAddon align="inline-end">hours</InputGroupAddon>
							</InputGroup>
						</Field>
					) : null}
					<PolicyToggle
						id="policy-working-days"
						label="Weekends and holidays don't use leave balance"
						description="Charge working days only when a request spans a weekend."
						checked={form.chargeWorkingDaysOnly}
						onCheckedChange={(checked) =>
							patch({ chargeWorkingDaysOnly: checked })
						}
					/>
				</FieldGroup>

				<FieldGroup>
					<FieldTitle>Request rules</FieldTitle>
					<Field>
						<FieldLabel htmlFor="policy-min-service">
							Minimum service
						</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id="policy-min-service"
								type="number"
								min={0}
								max={3650}
								value={form.minServiceDays}
								onChange={(event) =>
									patch({ minServiceDays: event.target.value })
								}
							/>
							<InputGroupAddon align="inline-end">days</InputGroupAddon>
						</InputGroup>
					</Field>
					<Field>
						<FieldLabel htmlFor="policy-notice">Notice</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id="policy-notice"
								type="number"
								min={0}
								max={365}
								value={form.noticeDays}
								onChange={(event) => patch({ noticeDays: event.target.value })}
							/>
							<InputGroupAddon align="inline-end">days</InputGroupAddon>
						</InputGroup>
					</Field>
					<Field>
						<FieldLabel htmlFor="policy-max-consecutive">
							Maximum consecutive days
						</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id="policy-max-consecutive"
								type="number"
								min={0}
								max={365}
								placeholder="No limit"
								value={form.maxConsecutiveDays}
								onChange={(event) =>
									patch({ maxConsecutiveDays: event.target.value })
								}
							/>
							<InputGroupAddon align="inline-end">days</InputGroupAddon>
						</InputGroup>
					</Field>
					<Field>
						<FieldLabel htmlFor="policy-document-after">
							Document required after
						</FieldLabel>
						<InputGroup>
							<InputGroupInput
								id="policy-document-after"
								type="number"
								min={0}
								max={365}
								placeholder="Never"
								value={form.documentRequiredAfterDays}
								onChange={(event) =>
									patch({ documentRequiredAfterDays: event.target.value })
								}
							/>
							<InputGroupAddon align="inline-end">days</InputGroupAddon>
						</InputGroup>
					</Field>
					<PolicyToggle
						id="policy-partial-days"
						label="Allow partial days"
						description="Workers can request part of a day."
						checked={form.allowPartialDays}
						onCheckedChange={(checked) => patch({ allowPartialDays: checked })}
					/>
				</FieldGroup>

				<FieldGroup>
					<FieldTitle>Encashment</FieldTitle>
					<PolicyToggle
						id="policy-encashment"
						label="Allow encashment"
						description="Workers can convert unused leave into pay."
						checked={form.encashmentEnabled}
						onCheckedChange={(checked) => patch({ encashmentEnabled: checked })}
					/>
					{form.encashmentEnabled ? (
						<Field>
							<FieldLabel htmlFor="policy-encashment-max">
								Maximum encashment per year
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="policy-encashment-max"
									type="number"
									min={0}
									step={0.5}
									placeholder="No limit"
									value={form.maxEncashmentHoursPerYear}
									onChange={(event) =>
										patch({
											maxEncashmentHoursPerYear: event.target.value,
										})
									}
								/>
								<InputGroupAddon align="inline-end">hours</InputGroupAddon>
							</InputGroup>
						</Field>
					) : null}
				</FieldGroup>

				<FieldGroup>
					<FieldTitle>Leave year</FieldTitle>
					<Field>
						<FieldLabel htmlFor="policy-leave-year-start">
							Leave year starts
						</FieldLabel>
						<Input
							id="policy-leave-year-start"
							placeholder="01-01"
							maxLength={5}
							value={form.leaveYearStartMonthDay}
							onChange={(event) =>
								patch({ leaveYearStartMonthDay: event.target.value })
							}
						/>
						<FieldDescription>Month and day, as MM-DD.</FieldDescription>
					</Field>
				</FieldGroup>
			</form>
		</SettingsFormSheet>
	);
}

function accrualSummary(policy: LeavePolicyDto | null): string {
	if (!policy || policy.accrualMethod === "none") return "None";
	const minutes = policy.accrualMinutes;
	const label = ACCRUAL_METHOD_LABELS[policy.accrualMethod];
	if (
		policy.accrualMethod === "weekly" ||
		policy.accrualMethod === "biweekly"
	) {
		return `${minutes} min ${label} · ${WEEKDAY_NAMES[policy.accrualWeekday] ?? ""}`;
	}
	if (policy.accrualMethod === "monthly") {
		return `${minutes} min ${label} · day ${policy.accrualDay}`;
	}
	if (policy.accrualMethod === "semimonthly") {
		return `${minutes} min ${label} · days ${policy.accrualDay} & ${
			policy.accrualDay + 15
		}`;
	}
	if (policy.accrualMethod === "annual") {
		return `${minutes} min ${label} · ${policy.annualAccrualMonthDay ?? ""}`;
	}
	return `${minutes} min per ${policy.accrualPerHoursWorked}h worked`;
}

function carryForwardSummary(policy: LeavePolicyDto | null): string {
	if (!policy) return "—";
	if (!policy.carryForwardEnabled) return "Off";
	const limit =
		policy.maxCarryForwardMinutes == null
			? "No limit"
			: `${policy.maxCarryForwardMinutes}m max`;
	const expiry =
		policy.carryForwardExpiryMonths == null
			? ""
			: ` · expires ${policy.carryForwardExpiryMonths} mo`;
	return `${limit}${expiry}`;
}

function balanceSummary(policy: LeavePolicyDto | null): string {
	if (!policy) return "—";
	if (!policy.allowNegative) return "No negative";
	return `Negative up to ${policy.maxNegativeMinutes}m`;
}

function chargingSummary(policy: LeavePolicyDto | null): string {
	if (!policy) return "—";
	return policy.chargeWorkingDaysOnly ? "Working days" : "Calendar days";
}

function requestRulesSummary(policy: LeavePolicyDto | null): string {
	if (!policy) return "—";
	const parts: string[] = [];
	if (policy.noticeDays > 0) parts.push(`${policy.noticeDays}d notice`);
	if (policy.maxConsecutiveDays != null) {
		parts.push(`max ${policy.maxConsecutiveDays}d`);
	}
	if (policy.documentRequiredAfterDays != null) {
		parts.push(`docs after ${policy.documentRequiredAfterDays}d`);
	}
	if (policy.minServiceDays > 0) {
		parts.push(`${policy.minServiceDays}d service`);
	}
	return parts.length > 0 ? parts.join(" · ") : "None";
}

function encashmentSummary(policy: LeavePolicyDto | null): string {
	if (!policy) return "—";
	if (!policy.encashmentEnabled) return "Off";
	return policy.maxEncashmentMinutesPerYear == null
		? "Enabled"
		: `Up to ${policy.maxEncashmentMinutesPerYear}m/yr`;
}

const leaveHelper = createDataColumnHelper<LeaveTypeDto>();

export function LeavePoliciesCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const leaveTypes = useLeaveTypes(workplaceId);
	const [editingType, setEditingType] = useState<LeaveTypeDto | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const rows = leaveTypes.data?.leaveTypes ?? [];

	const openEditor = (leaveType: LeaveTypeDto) => {
		setEditingType(leaveType);
		setSheetOpen(true);
	};

	const columns = useMemo(
		() =>
			leaveHelper.columns([
				leaveHelper.accessor("name", {
					header: "Leave type",
					cell: ({ row }) => (
						<span className="flex items-center gap-2">
							<span className="font-medium">{row.original.name}</span>
							{row.original.policy ? null : (
								<Badge variant="outline">No policy</Badge>
							)}
						</span>
					),
				}),
				leaveHelper.accessor((row) => accrualSummary(row.policy), {
					id: "accrual",
					header: "Accrual",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground tabular-nums">
							{getValue()}
						</span>
					),
				}),
				leaveHelper.accessor((row) => carryForwardSummary(row.policy), {
					id: "carryForward",
					header: "Carry-forward",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
				leaveHelper.accessor((row) => balanceSummary(row.policy), {
					id: "balance",
					header: "Balance",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
				leaveHelper.accessor((row) => chargingSummary(row.policy), {
					id: "charging",
					header: "Charging",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
				leaveHelper.accessor((row) => requestRulesSummary(row.policy), {
					id: "requests",
					header: "Request rules",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
				leaveHelper.accessor((row) => encashmentSummary(row.policy), {
					id: "encashment",
					header: "Encashment",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
			]),
		[],
	);

	return (
		<div className="flex flex-col gap-4">
			<p className="max-w-prose text-muted-foreground text-sm">
				Rules for how each leave type accrues and is charged. A leave type
				without a policy keeps legacy behavior: no accrual, calendar-day
				charging, and no balance limits.
			</p>
			<SettingsCrudCard
				title="Leave policies"
				description="Accrual and balance rules for every leave type."
				count={rows.length}
				data={rows}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => `${row.name} ${row.code ?? ""}`}
				searchPlaceholder="Search leave types"
				isLoading={leaveTypes.isLoading}
				entityLabel="leave policy"
				emptyIcon={<CalendarClockIcon />}
				emptyTitle="No leave types yet"
				emptyDescription="Add leave types before configuring accrual and balance rules."
				addLabel="Add policy"
				rowActions={{
					onEdit: openEditor,
					deleteTitle: "Remove this leave policy?",
					deleteDescription:
						"Clear every rule on this policy and fall back to legacy behavior.",
				}}
			/>
			<LeavePolicySheet
				workplaceId={workplaceId}
				leaveType={editingType}
				open={sheetOpen}
				onOpenChange={setSheetOpen}
			/>
		</div>
	);
}

type StepDraft = {
	key: string;
	approverKind: ApprovalChainStepDto["approverKind"];
	approverEmploymentId: string;
	approverPrivilege: string;
	escalateAfterHours: string;
	escalationKind: "" | ApprovalChainStepDto["approverKind"];
	escalationEmploymentId: string;
};

let stepKeySeed = 0;

function nextStepKey(): string {
	stepKeySeed += 1;
	return `approval-step-${stepKeySeed}`;
}

function newStepDraft(): StepDraft {
	return {
		key: nextStepKey(),
		approverKind: "workplace_managers",
		approverEmploymentId: "",
		approverPrivilege: "approvals.review",
		escalateAfterHours: "",
		escalationKind: "",
		escalationEmploymentId: "",
	};
}

function stepsToDrafts(steps: ApprovalChainStepDto[]): StepDraft[] {
	if (steps.length === 0) return [newStepDraft()];
	return steps.map((step) => ({
		key: nextStepKey(),
		approverKind: step.approverKind,
		approverEmploymentId: step.approverEmploymentId ?? "",
		approverPrivilege: step.approverPrivilege ?? "approvals.review",
		escalateAfterHours:
			step.escalateAfterHours == null ? "" : String(step.escalateAfterHours),
		escalationKind: step.escalationKind ?? "",
		escalationEmploymentId: step.escalationEmploymentId ?? "",
	}));
}

const APPROVER_KIND_ITEMS = [
	{ label: "Workplace managers", value: "workplace_managers" },
	{ label: "A specific person", value: "specific_employment" },
	{ label: "Anyone with a capability", value: "privilege" },
] as const;

const ESCALATION_KIND_ITEMS = [
	{ label: "No escalation", value: "none" },
	...APPROVER_KIND_ITEMS,
] as const;

const APPROVER_PRIVILEGE_ITEMS = [
	{ label: "Can review approvals", value: "approvals.review" },
	{ label: "Can manage policies", value: "policies.manage" },
	{ label: "Can manage workers", value: "workers.manage" },
	{ label: "Can manage settings", value: "settings.manage" },
] as const;

function privilegeLabel(value: string | null | undefined): string {
	return (
		APPROVER_PRIVILEGE_ITEMS.find((item) => item.value === value)?.label ??
		value ??
		"Capability"
	);
}

function stepApproverLabel(
	step: ApprovalChainStepDto,
	workerName: (employmentId: string) => string,
): string {
	if (step.approverKind === "workplace_managers") return "Workplace managers";
	if (step.approverKind === "privilege") {
		return privilegeLabel(step.approverPrivilege);
	}
	return workerName(step.approverEmploymentId ?? "") || "A specific person";
}

function chainStepsSummary(
	chain: ApprovalChainDto,
	workerName: (employmentId: string) => string,
): string {
	if (chain.steps.length === 0) return "No steps";
	return chain.steps
		.map((step) => {
			const label = stepApproverLabel(step, workerName);
			if (!step.escalationKind) return label;
			const hours =
				step.escalateAfterHours == null
					? ""
					: ` after ${step.escalateAfterHours}h`;
			const escalation =
				step.escalationKind === "workplace_managers"
					? "Workplace managers"
					: step.escalationKind === "privilege"
						? privilegeLabel(step.approverPrivilege)
						: workerName(step.escalationEmploymentId ?? "") ||
							"A specific person";
			return `${label} → ${escalation}${hours}`;
		})
		.join(", then ");
}

const chainHelper = createDataColumnHelper<ApprovalChainDto>();

const chainFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between";

export function LeaveApprovalChainsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { formatPerson } = useDisplayPrefs();
	const chains = useApprovalChains(workplaceId);
	const workers = useWorkers(workplaceId);
	const save = useSaveApprovalChain(workplaceId);
	const remove = useDeleteApprovalChain(workplaceId);

	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isDefault, setIsDefault] = useState(false);
	const [steps, setSteps] = useState<StepDraft[]>(() => [newStepDraft()]);

	const workerItems = useMemo(
		() =>
			(workers.data?.workers ?? [])
				.filter((worker) => worker.status === "active")
				.map((worker) => ({
					label: formatPerson(worker.profile.fullName, worker.profile.email),
					value: worker.employmentId,
				})),
		[workers.data, formatPerson],
	);

	const workerName = useCallback(
		(employmentId: string) =>
			workerItems.find((item) => item.value === employmentId)?.label ??
			"A specific person",
		[workerItems],
	);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setDescription("");
		setIsDefault(false);
		setSteps([newStepDraft()]);
	}, []);

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};

	const startEdit = (chain: ApprovalChainDto) => {
		setEditingId(chain.id);
		setName(chain.name);
		setDescription(chain.description ?? "");
		setIsDefault(chain.isDefault);
		setSteps(stepsToDrafts(chain.steps));
		setOpen(true);
	};

	const updateStep = (index: number, partial: Partial<StepDraft>) => {
		setSteps((current) =>
			current.map((step, stepIndex) =>
				stepIndex === index ? { ...step, ...partial } : step,
			),
		);
	};

	const moveStep = (index: number, delta: number) => {
		setSteps((current) => {
			const target = index + delta;
			if (target < 0 || target >= current.length) return current;
			const next = [...current];
			const [item] = next.splice(index, 1);
			if (!item) return current;
			next.splice(target, 0, item);
			return next;
		});
	};

	const removeStep = (index: number) => {
		setSteps((current) =>
			current.filter((_, stepIndex) => stepIndex !== index),
		);
	};

	const addStep = () => {
		setSteps((current) => [...current, newStepDraft()]);
	};

	const stepsValid =
		steps.length > 0 &&
		steps.every(
			(step) =>
				(step.approverKind !== "specific_employment" ||
					step.approverEmploymentId !== "") &&
				(step.approverKind !== "privilege" || step.approverPrivilege !== "") &&
				(step.escalationKind !== "specific_employment" ||
					step.escalationEmploymentId !== ""),
		);
	const canSave = name.trim().length > 0 && stepsValid && !save.isPending;

	const submit = () => {
		save.mutate(
			{
				id: editingId ?? undefined,
				name: name.trim(),
				description: description.trim() || null,
				isDefault,
				steps: steps.map((step) => ({
					approverKind: step.approverKind,
					approverEmploymentId:
						step.approverKind === "specific_employment"
							? step.approverEmploymentId
							: null,
					approverPrivilege:
						step.approverKind === "privilege" ? step.approverPrivilege : null,
					escalateAfterHours: nullableInteger(step.escalateAfterHours),
					escalationKind:
						step.escalationKind === "" ? null : step.escalationKind,
					escalationEmploymentId:
						step.escalationKind === "specific_employment"
							? step.escalationEmploymentId
							: null,
				})),
			},
			{
				onSuccess: () => {
					setOpen(false);
					resetForm();
					toast.success("Approval chain saved.");
				},
				onError: (error) => toast.error((error as Error).message),
			},
		);
	};

	const removeChain = () => {
		if (!editingId) return;
		remove.mutate(editingId, {
			onSuccess: () => {
				setOpen(false);
				resetForm();
				toast.success("Approval chain deleted.");
			},
			onError: (error) => toast.error((error as Error).message),
		});
	};

	const columns = useMemo(
		() =>
			chainHelper.columns([
				chainHelper.accessor("name", {
					header: "Chain",
					cell: ({ row }) => (
						<span className="flex items-center gap-2">
							<span className="font-medium">{row.original.name}</span>
							{row.original.isDefault ? (
								<Badge variant="secondary">Default</Badge>
							) : null}
						</span>
					),
				}),
				chainHelper.accessor((row) => chainStepsSummary(row, workerName), {
					id: "steps",
					header: "Steps",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
			]),
		[workerName],
	);

	return (
		<>
			<SettingsCrudCard
				title="Approval chains"
				description="Who signs off on time-off requests, in order. Leave types without a chain use the default."
				count={chains.data?.length ?? 0}
				data={chains.data ?? []}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => `${row.name} ${row.description ?? ""}`}
				searchPlaceholder="Search chains"
				isLoading={chains.isLoading}
				entityLabel="approval chain"
				emptyIcon={<GitBranchIcon />}
				emptyTitle="No approval chains yet"
				emptyDescription="Add a chain to route requests through specific approvers."
				addLabel="Add chain"
				onAdd={workplaceId ? startAdd : undefined}
				rowActions={{
					onEdit: startEdit,
					deleteTitle: "Delete this approval chain?",
					deleteDescription:
						"Leave types using it fall back to the default manager approval.",
				}}
			/>

			{workplaceId ? (
				<SettingsFormSheet
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) resetForm();
					}}
					title={editingId ? "Edit approval chain" : "Add approval chain"}
					description="Requests move through these steps in order, with an optional escalation for slow ones."
					footer={
						<div className={chainFooterClassName}>
							<div>
								{editingId ? (
									<ConfirmAction
										trigger={
											<>
												<Trash2Icon data-icon="inline-start" />
												Delete chain
											</>
										}
										title="Delete this approval chain?"
										description="Leave types using it fall back to the default manager approval."
										confirmLabel="Delete chain"
										destructive
										disabled={remove.isPending}
										onConfirm={removeChain}
									/>
								) : null}
							</div>
							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									variant="outline"
									onClick={() => {
										setOpen(false);
										resetForm();
									}}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									form="approval-chain-form"
									disabled={!canSave}
								>
									{save.isPending ? <Spinner data-icon="inline-start" /> : null}
									{editingId ? "Save chain" : "Add chain"}
								</Button>
							</div>
						</div>
					}
				>
					<form
						id="approval-chain-form"
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							submit();
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="approval-chain-name">Name</FieldLabel>
								<Input
									id="approval-chain-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Operations review"
									autoFocus
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="approval-chain-description">
									Description (optional)
								</FieldLabel>
								<Textarea
									id="approval-chain-description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									placeholder="When this chain is used."
								/>
							</Field>
							<PolicyToggle
								id="approval-chain-default"
								label="Default chain"
								description="Used by leave types that don't pick their own chain."
								checked={isDefault}
								onCheckedChange={setIsDefault}
							/>
							<Field>
								<FieldTitle>Steps</FieldTitle>
								<div className="flex flex-col gap-3">
									{steps.map((step, index) => (
										<div
											key={step.key}
											className="flex flex-col gap-3 rounded-lg border p-3"
										>
											<div className="flex items-center justify-between gap-2">
												<span className="font-medium text-sm">
													Step {index + 1}
												</span>
												<div className="flex items-center gap-1">
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={index === 0}
														onClick={() => moveStep(index, -1)}
														aria-label="Move step up"
													>
														<ArrowUpIcon />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={index === steps.length - 1}
														onClick={() => moveStep(index, 1)}
														aria-label="Move step down"
													>
														<ArrowDownIcon />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={steps.length === 1}
														onClick={() => removeStep(index)}
														aria-label="Remove step"
													>
														<Trash2Icon />
													</Button>
												</div>
											</div>
											<FieldGroup className="gap-3">
												<Field>
													<FieldLabel
														htmlFor={`approval-step-${step.key}-kind`}
													>
														Approver
													</FieldLabel>
													<Select
														items={[...APPROVER_KIND_ITEMS]}
														value={step.approverKind}
														onValueChange={(value) => {
															if (value) {
																updateStep(index, {
																	approverKind:
																		value as StepDraft["approverKind"],
																});
															}
														}}
													>
														<SelectTrigger
															id={`approval-step-${step.key}-kind`}
															className="w-full"
														>
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																{APPROVER_KIND_ITEMS.map((item) => (
																	<SelectItem
																		key={item.value}
																		value={item.value}
																	>
																		{item.label}
																	</SelectItem>
																))}
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
												{step.approverKind === "specific_employment" ? (
													<Field>
														<FieldLabel
															htmlFor={`approval-step-${step.key}-person`}
														>
															Specific person
														</FieldLabel>
														<Select
															items={workerItems}
															value={step.approverEmploymentId}
															onValueChange={(value) => {
																if (value) {
																	updateStep(index, {
																		approverEmploymentId: value,
																	});
																}
															}}
														>
															<SelectTrigger
																id={`approval-step-${step.key}-person`}
																className="w-full"
															>
																<SelectValue placeholder="Choose a person" />
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectGroup>
																	{workerItems.map((item) => (
																		<SelectItem
																			key={item.value}
																			value={item.value}
																		>
																			{item.label}
																		</SelectItem>
																	))}
																</SelectGroup>
															</SelectContent>
														</Select>
													</Field>
												) : null}
												{step.approverKind === "privilege" ? (
													<Field>
														<FieldLabel
															htmlFor={`approval-step-${step.key}-privilege`}
														>
															Capability
														</FieldLabel>
														<Select
															items={[...APPROVER_PRIVILEGE_ITEMS]}
															value={step.approverPrivilege}
															onValueChange={(value) => {
																if (value) {
																	updateStep(index, {
																		approverPrivilege: value,
																	});
																}
															}}
														>
															<SelectTrigger
																id={`approval-step-${step.key}-privilege`}
																className="w-full"
															>
																<SelectValue />
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectGroup>
																	{APPROVER_PRIVILEGE_ITEMS.map((item) => (
																		<SelectItem
																			key={item.value}
																			value={item.value}
																		>
																			{item.label}
																		</SelectItem>
																	))}
																</SelectGroup>
															</SelectContent>
														</Select>
													</Field>
												) : null}
												<Field>
													<FieldLabel
														htmlFor={`approval-step-${step.key}-escalate`}
													>
														Escalate after
													</FieldLabel>
													<InputGroup>
														<InputGroupInput
															id={`approval-step-${step.key}-escalate`}
															type="number"
															min={0}
															max={720}
															placeholder="Never"
															value={step.escalateAfterHours}
															onChange={(event) =>
																updateStep(index, {
																	escalateAfterHours: event.target.value,
																})
															}
														/>
														<InputGroupAddon align="inline-end">
															hours
														</InputGroupAddon>
													</InputGroup>
												</Field>
												<Field>
													<FieldLabel
														htmlFor={`approval-step-${step.key}-escalation`}
													>
														Escalate to
													</FieldLabel>
													<Select
														items={[...ESCALATION_KIND_ITEMS]}
														value={step.escalationKind || "none"}
														onValueChange={(value) => {
															if (value) {
																updateStep(index, {
																	escalationKind:
																		value === "none"
																			? ""
																			: (value as StepDraft["escalationKind"]),
																});
															}
														}}
													>
														<SelectTrigger
															id={`approval-step-${step.key}-escalation`}
															className="w-full"
														>
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																{ESCALATION_KIND_ITEMS.map((item) => (
																	<SelectItem
																		key={item.value}
																		value={item.value}
																	>
																		{item.label}
																	</SelectItem>
																))}
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
												{step.escalationKind === "specific_employment" ? (
													<Field>
														<FieldLabel
															htmlFor={`approval-step-${step.key}-escalation-person`}
														>
															Escalation person
														</FieldLabel>
														<Select
															items={workerItems}
															value={step.escalationEmploymentId}
															onValueChange={(value) => {
																if (value) {
																	updateStep(index, {
																		escalationEmploymentId: value,
																	});
																}
															}}
														>
															<SelectTrigger
																id={`approval-step-${step.key}-escalation-person`}
																className="w-full"
															>
																<SelectValue placeholder="Choose a person" />
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectGroup>
																	{workerItems.map((item) => (
																		<SelectItem
																			key={item.value}
																			value={item.value}
																		>
																			{item.label}
																		</SelectItem>
																	))}
																</SelectGroup>
															</SelectContent>
														</Select>
													</Field>
												) : null}
											</FieldGroup>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={addStep}
										disabled={steps.length >= 10}
									>
										<PlusIcon data-icon="inline-start" />
										Add step
									</Button>
								</div>
							</Field>
						</FieldGroup>
					</form>
				</SettingsFormSheet>
			) : null}
		</>
	);
}
