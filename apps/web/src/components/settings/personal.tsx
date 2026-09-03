import { Button } from "@SchedulesManager/ui/components/button";
import {
	FieldDescription,
	FieldGroup,
	FieldLegend,
	FieldSeparator,
	FieldSet,
} from "@SchedulesManager/ui/components/field";
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
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { SettingsToggleField } from "@/components/settings/core";
import { SettingsSection } from "@/components/settings/page";
import { api } from "@/lib/api";
import type { MeProfile } from "@/lib/queries";

const TIME_FORMAT_ITEMS = [
	{ label: "12-hour", value: "12h" },
	{ label: "24-hour", value: "24h" },
] as const;

const NAME_FORMAT_ITEMS = [
	{ label: "Full name", value: "full" },
	{ label: "First name and last initial", value: "first_last_initial" },
	{ label: "First name only", value: "first" },
] as const;

function previewShiftTimes(format: "12h" | "24h"): string {
	return format === "24h" ? "09:00–17:30" : "9:00 AM–5:30 PM";
}

function previewName(
	format: MeProfile["nameFormat"],
	fullName: string | null,
): string {
	const parts = (fullName?.trim() || "Alex Rivera").split(/\s+/);
	const first = parts[0] ?? "Alex";
	const last = parts.length > 1 ? (parts[parts.length - 1] ?? "Rivera") : "";
	if (format === "first") return first;
	if (format === "first_last_initial") {
		return last ? `${first} ${last.slice(0, 1)}.` : first;
	}
	return last ? `${first} ${last}` : first;
}

export function DisplayPreferencesCard({
	profile,
	isLoading,
	onChange,
}: {
	profile: MeProfile | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	const [timeFormat, setTimeFormat] = useState<"12h" | "24h" | null>(null);
	const [nameFormat, setNameFormat] = useState<
		"full" | "first_last_initial" | "first" | null
	>(null);
	const save = useMutation({
		mutationFn: () =>
			api("/v1/me", {
				method: "PATCH",
				body: {
					timeFormat: timeFormat ?? profile?.timeFormat,
					nameFormat: nameFormat ?? profile?.nameFormat,
				},
			}),
		onSuccess: () => {
			setTimeFormat(null);
			setNameFormat(null);
			onChange();
			toast.success("Preferences saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	if (isLoading || !profile) {
		return (
			<SettingsSection>
				<div className="grid gap-3">
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
				</div>
			</SettingsSection>
		);
	}

	const selectedTime = timeFormat ?? profile.timeFormat;
	const selectedName = nameFormat ?? profile.nameFormat;
	const timePreview = previewShiftTimes(selectedTime);
	const namePreview = previewName(selectedName, profile.fullName);

	return (
		<SettingsSection
			title="Display"
			description="How times and names appear for you. These do not change workplace rules."
			footer={
				<Button
					disabled={
						save.isPending || (timeFormat === null && nameFormat === null)
					}
					onClick={() => save.mutate()}
				>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					{save.isPending ? "Saving…" : "Save changes"}
				</Button>
			}
		>
			<FieldGroup>
				<FieldSet>
					<FieldLegend variant="legend">Time format</FieldLegend>
					<FieldDescription>
						Applies to times shown for you. Schedule grids still follow the
						workplace week start.
					</FieldDescription>
					<Select
						items={[...TIME_FORMAT_ITEMS]}
						value={selectedTime}
						onValueChange={(value) => {
							if (value === "12h" || value === "24h") setTimeFormat(value);
						}}
					>
						<SelectTrigger
							id="time-format"
							className="w-full @md/field-group:max-w-xs"
							aria-describedby="time-format-preview"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent alignItemWithTrigger={false}>
							<SelectGroup>
								{TIME_FORMAT_ITEMS.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<p
						id="time-format-preview"
						className="text-muted-foreground text-sm tabular-nums"
					>
						Preview: {timePreview}
					</p>
				</FieldSet>
				<FieldSeparator />
				<FieldSet>
					<FieldLegend variant="legend">Name format</FieldLegend>
					<FieldDescription>
						How coworker names should appear for you on the schedule and in
						lists.
					</FieldDescription>
					<Select
						items={[...NAME_FORMAT_ITEMS]}
						value={selectedName}
						onValueChange={(value) => {
							if (
								value === "full" ||
								value === "first_last_initial" ||
								value === "first"
							) {
								setNameFormat(value);
							}
						}}
					>
						<SelectTrigger
							id="name-format"
							className="w-full @md/field-group:max-w-xs"
							aria-describedby="name-format-preview"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent alignItemWithTrigger={false}>
							<SelectGroup>
								{NAME_FORMAT_ITEMS.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<p id="name-format-preview" className="text-muted-foreground text-sm">
						Preview: {namePreview}
						{profile.fullName?.trim() ? "" : " (sample name)"}
					</p>
				</FieldSet>
			</FieldGroup>
		</SettingsSection>
	);
}

export function NotificationPreferencesCard({
	profile,
	isLoading,
	onChange,
}: {
	profile: MeProfile | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	const prefs = profile?.notificationPreferences;
	const [draft, setDraft] = useState<
		Partial<MeProfile["notificationPreferences"]>
	>({});
	const save = useMutation({
		mutationFn: () =>
			api("/v1/me", {
				method: "PATCH",
				body: {
					notificationPreferences: {
						schedule: draft.schedule ?? prefs?.schedule,
						messages: draft.messages ?? prefs?.messages,
						timeOff: draft.timeOff ?? prefs?.timeOff,
						timeClock: draft.timeClock ?? prefs?.timeClock,
					},
				},
			}),
		onSuccess: () => {
			setDraft({});
			onChange();
			toast.success("Notification preferences saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function value(key: keyof MeProfile["notificationPreferences"]) {
		return draft[key] ?? prefs?.[key] ?? true;
	}

	if (isLoading || !profile) {
		return (
			<SettingsSection>
				<div className="grid gap-3">
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
				</div>
			</SettingsSection>
		);
	}

	return (
		<SettingsSection
			title="Notify me about"
			description="Each topic is a separate channel. Turn off anything you do not need to hear about."
			footer={
				<Button
					disabled={save.isPending || Object.keys(draft).length === 0}
					onClick={() => save.mutate()}
				>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					{save.isPending ? "Saving…" : "Save changes"}
				</Button>
			}
		>
			<FieldGroup>
				<FieldSet>
					<FieldLegend variant="legend">Schedule & time clock</FieldLegend>
					<FieldDescription>
						Published weeks, late changes, and punch follow-up.
					</FieldDescription>
					<SettingsToggleField
						id="notify-schedule"
						label="Schedule"
						description="Published schedules, late material changes, and shift assignments."
						checked={value("schedule")}
						onCheckedChange={(checked) =>
							setDraft((current) => {
								const next = { ...current, schedule: checked };
								if (checked === (prefs?.schedule ?? true)) {
									const { schedule: _drop, ...rest } = next;
									return rest;
								}
								return next;
							})
						}
					/>
					<SettingsToggleField
						id="notify-time-clock"
						label="Time clock"
						description="Forgotten punch reminders and timesheet follow-up."
						checked={value("timeClock")}
						onCheckedChange={(checked) =>
							setDraft((current) => {
								const next = { ...current, timeClock: checked };
								if (checked === (prefs?.timeClock ?? true)) {
									const { timeClock: _drop, ...rest } = next;
									return rest;
								}
								return next;
							})
						}
					/>
				</FieldSet>
				<FieldSeparator />
				<FieldSet>
					<FieldLegend variant="legend">Team</FieldLegend>
					<FieldDescription>
						Conversations and time-off decisions that need a response.
					</FieldDescription>
					<SettingsToggleField
						id="notify-messages"
						label="Messages"
						description="Workplace conversations and direct messages."
						checked={value("messages")}
						onCheckedChange={(checked) =>
							setDraft((current) => {
								const next = { ...current, messages: checked };
								if (checked === (prefs?.messages ?? true)) {
									const { messages: _drop, ...rest } = next;
									return rest;
								}
								return next;
							})
						}
					/>
					<SettingsToggleField
						id="notify-time-off"
						label="Time off"
						description="Time-off requests you submit or need to decide."
						checked={value("timeOff")}
						onCheckedChange={(checked) =>
							setDraft((current) => {
								const next = { ...current, timeOff: checked };
								if (checked === (prefs?.timeOff ?? true)) {
									const { timeOff: _drop, ...rest } = next;
									return rest;
								}
								return next;
							})
						}
					/>
				</FieldSet>
			</FieldGroup>
		</SettingsSection>
	);
}
