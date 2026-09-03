import { Button } from "@SchedulesManager/ui/components/button";
import { FieldGroup } from "@SchedulesManager/ui/components/field";
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
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { SettingsField, SettingsToggleField } from "@/components/settings/core";
import {
	SettingsSaveSection,
	SettingsSection,
} from "@/components/settings/page";
import { api } from "@/lib/api";
import type { WorkplaceSettings } from "@/lib/queries";

const SCHEDULE_VISIBILITY_ITEMS = [
	{ label: "Everyone's shifts", value: "full" },
	{ label: "Only their own shifts", value: "own" },
] as const;

const LEAVE_CAP_RESET_ITEMS = [
	{ label: "Do not reset", value: "none" },
	{ label: "Calendar year", value: "calendar_year" },
	{ label: "Hire date", value: "hire_date" },
	{ label: "Custom date", value: "custom_date" },
] as const;

function usePolicyDraft(
	settings: WorkplaceSettings | undefined,
	onChange: () => void,
) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<Partial<WorkplaceSettings>>({});
	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${settings?.id}`, {
				method: "PATCH",
				body: draft,
			}),
		onSuccess: () => {
			setDraft({});
			queryClient.invalidateQueries({ queryKey: ["me"] });
			onChange();
			toast.success("Workplace settings saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function value<K extends keyof WorkplaceSettings>(
		key: K,
	): WorkplaceSettings[K] {
		const override = draft[key];
		if (override !== undefined) return override as WorkplaceSettings[K];
		if (!settings) {
			throw new Error("Workplace settings are not loaded");
		}
		return settings[key];
	}

	function patch(partial: Partial<WorkplaceSettings>) {
		setDraft((current) => ({ ...current, ...partial }));
	}

	return {
		draft,
		value,
		patch,
		save,
		dirty: Object.keys(draft).length > 0,
	};
}

function PolicyCard({
	settings,
	isLoading,
	onChange,
	idleMessage,
	children,
}: {
	settings: WorkplaceSettings | undefined;
	isLoading: boolean;
	onChange: () => void;
	idleMessage: string;
	children: (form: ReturnType<typeof usePolicyDraft>) => ReactNode;
}) {
	const form = usePolicyDraft(settings, onChange);

	if (isLoading || !settings) {
		return (
			<SettingsSection>
				<div className="grid gap-3">
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
				</div>
			</SettingsSection>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{children(form)}
			<SettingsSaveSection
				message={form.dirty ? "You have unsaved policy changes." : idleMessage}
				footer={
					<Button
						disabled={form.save.isPending || !form.dirty}
						onClick={() => form.save.mutate()}
					>
						{form.save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{form.save.isPending ? "Saving…" : "Save changes"}
					</Button>
				}
			/>
		</div>
	);
}

export function CompanyPoliciesCard({
	settings,
	isLoading,
	onChange,
}: {
	settings: WorkplaceSettings | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	return (
		<PolicyCard
			settings={settings}
			isLoading={isLoading}
			onChange={onChange}
			idleMessage="These tools apply to everyone at this workplace."
		>
			{(form) => (
				<>
					<SettingsSection
						title="Features"
						description="Turn workplace tools on or off for everyone."
					>
						<FieldGroup>
							<SettingsToggleField
								id="messaging-enabled"
								label="Messaging"
								description="Workplace and direct conversations."
								checked={form.value("messagingEnabled")}
								onCheckedChange={(checked) =>
									form.patch({ messagingEnabled: checked })
								}
							/>
							<SettingsToggleField
								id="announcements-enabled"
								label="Announcements"
								description="Managers can post workplace announcements."
								checked={form.value("announcementsEnabled")}
								onCheckedChange={(checked) =>
									form.patch({ announcementsEnabled: checked })
								}
							/>
							<SettingsToggleField
								id="tasks-enabled"
								label="Shift tasks"
								description="Checklists attached to shifts."
								checked={form.value("tasksEnabled")}
								onCheckedChange={(checked) =>
									form.patch({ tasksEnabled: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Visibility"
						description="What workers can see about each other."
					>
						<FieldGroup>
							<SettingsToggleField
								id="contact-details-visible"
								label="Show contact details"
								description="Workers can see each other's emails in conversations and the directory."
								checked={form.value("contactDetailsVisible")}
								onCheckedChange={(checked) =>
									form.patch({ contactDetailsVisible: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
				</>
			)}
		</PolicyCard>
	);
}

export function SchedulePoliciesCard({
	settings,
	isLoading,
	onChange,
}: {
	settings: WorkplaceSettings | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	return (
		<PolicyCard
			settings={settings}
			isLoading={isLoading}
			onChange={onChange}
			idleMessage="These policies apply to published schedules at this workplace."
		>
			{(form) => (
				<>
					<SettingsSection
						title="Visibility"
						description="What a worker can see on a published schedule."
					>
						<FieldGroup>
							<SettingsField
								id="schedule-visibility"
								label="Worker schedule view"
								description="Whether a worker sees only their shifts or the full published schedule."
							>
								<Select
									items={[...SCHEDULE_VISIBILITY_ITEMS]}
									value={form.value("workerScheduleVisibility")}
									onValueChange={(value) => {
										if (value === "own" || value === "full") {
											form.patch({ workerScheduleVisibility: value });
										}
									}}
								>
									<SelectTrigger id="schedule-visibility" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											{SCHEDULE_VISIBILITY_ITEMS.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</SettingsField>
							<SettingsToggleField
								id="time-off-visibility"
								label="Show others' approved time off"
								description="Workers can see approved time-off on the schedule."
								checked={form.value("workerTimeOffVisibility")}
								onCheckedChange={(checked) =>
									form.patch({ workerTimeOffVisibility: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Exchanges"
						description="How workers cover an assigned shift they cannot work."
					>
						<FieldGroup>
							<SettingsToggleField
								id="shift-exchanges"
								label="Shift exchanges"
								description="Workers can propose swapping assigned shifts."
								checked={form.value("shiftExchangesEnabled")}
								onCheckedChange={(checked) =>
									form.patch({ shiftExchangesEnabled: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Breaks & compliance"
						description="Rest rules used when building and warning on the schedule."
					>
						<FieldGroup>
							<SettingsToggleField
								id="breaks-enabled"
								label="Breaks"
								description="Workers can start and end unpaid breaks on a time entry."
								checked={form.value("breaksEnabled")}
								onCheckedChange={(checked) =>
									form.patch({ breaksEnabled: checked })
								}
							/>
							<SettingsField
								id="clopening-minutes"
								label="Minimum rest between shifts"
								description="0 disables. Used as a workplace rule for close-to-open gaps."
							>
								<InputGroup>
									<InputGroupInput
										id="clopening-minutes"
										type="number"
										min={0}
										max={2880}
										value={form.value("clopeningMinutes")}
										onChange={(event) =>
											form.patch({
												clopeningMinutes: Number(event.target.value),
											})
										}
									/>
									<InputGroupAddon align="inline-end">min</InputGroupAddon>
								</InputGroup>
							</SettingsField>
							<SettingsField
								id="max-consecutive-days"
								label="Max consecutive workdays"
								description="0 disables. Warns when a worker is scheduled beyond this streak."
							>
								<InputGroup>
									<InputGroupInput
										id="max-consecutive-days"
										type="number"
										min={0}
										max={31}
										value={form.value("maxConsecutiveWorkDays")}
										onChange={(event) =>
											form.patch({
												maxConsecutiveWorkDays: Number(event.target.value),
											})
										}
									/>
									<InputGroupAddon align="inline-end">days</InputGroupAddon>
								</InputGroup>
							</SettingsField>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Restrictions"
						description="Limits on when workers can record that they cannot work."
					>
						<FieldGroup>
							<SettingsToggleField
								id="unavailability-approval"
								label="Unavailability needs approval"
								description="Recorded for managers. Approval workflow is not enforced yet."
								checked={form.value("unavailabilityRequiresApproval")}
								onCheckedChange={(checked) =>
									form.patch({ unavailabilityRequiresApproval: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
				</>
			)}
		</PolicyCard>
	);
}

export function TimeClockPoliciesCard({
	settings,
	isLoading,
	onChange,
}: {
	settings: WorkplaceSettings | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	return (
		<PolicyCard
			settings={settings}
			isLoading={isLoading}
			onChange={onChange}
			idleMessage="These rules apply to punches at every location."
		>
			{(form) => (
				<>
					<SettingsSection
						title="Clock-in"
						description="How early a worker can start a published shift."
					>
						<FieldGroup>
							<SettingsField
								id="early-clock-in"
								label="Early clock-in"
								description="Minutes before the published start that a punch is allowed. 0 means on time only."
							>
								<InputGroup>
									<InputGroupInput
										id="early-clock-in"
										type="number"
										min={0}
										max={180}
										value={form.value("earlyClockInMinutes")}
										onChange={(event) =>
											form.patch({
												earlyClockInMinutes: Number(event.target.value),
											})
										}
									/>
									<InputGroupAddon align="inline-end">min</InputGroupAddon>
								</InputGroup>
							</SettingsField>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Rounding & grace"
						description="How punches are rounded and when lateness or forgotten clock-outs are handled."
					>
						<FieldGroup>
							<SettingsField
								id="clock-round"
								label="Clock rounding"
								description="Round punches to this many minutes. 0 keeps the exact punch time."
							>
								<InputGroup>
									<InputGroupInput
										id="clock-round"
										type="number"
										min={0}
										max={30}
										value={form.value("clockRoundMinutes")}
										onChange={(event) =>
											form.patch({
												clockRoundMinutes: Number(event.target.value),
											})
										}
									/>
									<InputGroupAddon align="inline-end">min</InputGroupAddon>
								</InputGroup>
							</SettingsField>
							<SettingsField
								id="late-grace"
								label="Late arrival grace"
								description="Minutes after the published start before a punch is considered late."
							>
								<InputGroup>
									<InputGroupInput
										id="late-grace"
										type="number"
										min={0}
										max={180}
										value={form.value("lateArrivalGraceMinutes")}
										onChange={(event) =>
											form.patch({
												lateArrivalGraceMinutes: Number(event.target.value),
											})
										}
									/>
									<InputGroupAddon align="inline-end">min</InputGroupAddon>
								</InputGroup>
							</SettingsField>
							<SettingsField
								id="auto-clock-out"
								label="Auto clock-out grace"
								description="Close forgotten open punches this many minutes after the published shift ends. 0 disables."
							>
								<InputGroup>
									<InputGroupInput
										id="auto-clock-out"
										type="number"
										min={0}
										max={720}
										value={form.value("autoClockOutGraceMinutes")}
										onChange={(event) =>
											form.patch({
												autoClockOutGraceMinutes: Number(event.target.value),
											})
										}
									/>
									<InputGroupAddon align="inline-end">min</InputGroupAddon>
								</InputGroup>
							</SettingsField>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Location"
						description="Whether a punch must happen inside a location geofence."
					>
						<FieldGroup>
							<SettingsToggleField
								id="geofence-required"
								label="Require geofence"
								description="Clock-in must happen inside a location geofence. Set the radius on each location."
								checked={form.value("geofenceRequired")}
								onCheckedChange={(checked) =>
									form.patch({ geofenceRequired: checked })
								}
							/>
							<p className="text-muted-foreground text-sm">
								Configure coordinates and radius under{" "}
								<Link
									to="/dashboard/settings/locations"
									className="underline underline-offset-4"
								>
									Locations
								</Link>
								.
							</p>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Timesheets"
						description="What workers can attach to a time entry."
					>
						<FieldGroup>
							<SettingsToggleField
								id="timesheet-notes"
								label="Timesheet notes"
								description="Allow notes on time entries when that field is collected."
								checked={form.value("timesheetNotesEnabled")}
								onCheckedChange={(checked) =>
									form.patch({ timesheetNotesEnabled: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
				</>
			)}
		</PolicyCard>
	);
}

export function TimeOffPoliciesCard({
	settings,
	isLoading,
	onChange,
}: {
	settings: WorkplaceSettings | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	return (
		<PolicyCard
			settings={settings}
			isLoading={isLoading}
			onChange={onChange}
			idleMessage="Request rules apply to this workplace. Leave types stay on their own page."
		>
			{(form) => (
				<>
					<SettingsSection
						title="Requests"
						description="Who can submit a time-off request."
					>
						<FieldGroup>
							<SettingsToggleField
								id="workers-can-request"
								label="Workers can request time off"
								description="Managers can still record time off when this is off."
								checked={form.value("workersCanRequestTimeOff")}
								onCheckedChange={(checked) =>
									form.patch({ workersCanRequestTimeOff: checked })
								}
							/>
						</FieldGroup>
					</SettingsSection>
					<SettingsSection
						title="Balances"
						description="When remaining time-off minutes reset. Categories stay on Leave types."
					>
						<FieldGroup>
							<SettingsField
								id="leave-cap-reset"
								label="Leave cap reset"
								description="When remaining minutes return to the type's cap."
							>
								<Select
									items={[...LEAVE_CAP_RESET_ITEMS]}
									value={form.value("leaveCapReset")}
									onValueChange={(value) => {
										if (
											value === "none" ||
											value === "calendar_year" ||
											value === "hire_date" ||
											value === "custom_date"
										) {
											form.patch({ leaveCapReset: value });
										}
									}}
								>
									<SelectTrigger id="leave-cap-reset" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											{LEAVE_CAP_RESET_ITEMS.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</SettingsField>
							{form.value("leaveCapReset") === "custom_date" ? (
								<SettingsField
									id="leave-cap-reset-day"
									label="Reset on"
									description="Month and day, as MM-DD."
								>
									<InputGroup>
										<InputGroupInput
											id="leave-cap-reset-day"
											placeholder="01-01"
											maxLength={5}
											value={form.value("leaveCapResetMonthDay") ?? ""}
											onChange={(event) =>
												form.patch({
													leaveCapResetMonthDay: event.target.value || null,
												})
											}
										/>
									</InputGroup>
								</SettingsField>
							) : null}
							<p className="text-muted-foreground text-sm">
								Manage vacation, sick, and unpaid categories under{" "}
								<Link
									to="/dashboard/settings/leave"
									className="underline underline-offset-4"
								>
									Leave types
								</Link>
								.
							</p>
						</FieldGroup>
					</SettingsSection>
				</>
			)}
		</PolicyCard>
	);
}
