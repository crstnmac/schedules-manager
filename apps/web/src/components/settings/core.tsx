import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
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
import { Separator } from "@SchedulesManager/ui/components/separator";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPinIcon, TagsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import {
	LocationGeoFields,
	type LocationGeoValue,
} from "@/components/location-geo-fields";
import {
	SettingsSaveSection,
	SettingsSection,
} from "@/components/settings/page";
import { TimePicker } from "@/components/time-picker";
import { TimezoneSelect } from "@/components/timezone-select";
import { api } from "@/lib/api";
import type {
	LocationDto,
	PositionDto,
	WorkplaceSettings,
} from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

const EMPTY_GEO: LocationGeoValue = {
	addressLine: "",
	latitude: "",
	longitude: "",
	geofenceRadiusMeters: "",
};

const locationHelper = createDataColumnHelper<LocationDto>();
const positionHelper = createDataColumnHelper<PositionDto>();

const PAY_PERIOD_ITEMS = [
	{ label: "Weekly", value: "weekly" },
	{ label: "Every two weeks", value: "biweekly" },
	{ label: "Twice a month (1st–15th, 16th–end)", value: "semimonthly" },
	{ label: "Monthly", value: "monthly" },
] as const;

const WEEK_START_ITEMS = [
	{ label: "Sunday", value: "0" },
	{ label: "Monday", value: "1" },
	{ label: "Tuesday", value: "2" },
	{ label: "Wednesday", value: "3" },
	{ label: "Thursday", value: "4" },
	{ label: "Friday", value: "5" },
	{ label: "Saturday", value: "6" },
] as const;

export function SettingsField({
	id,
	label,
	description,
	children,
}: {
	id: string;
	label: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<Field orientation="responsive">
			<FieldContent>
				<FieldLabel htmlFor={id}>{label}</FieldLabel>
				{description ? (
					<FieldDescription>{description}</FieldDescription>
				) : null}
			</FieldContent>
			<div className="w-full @md/field-group:max-w-xs">{children}</div>
		</Field>
	);
}

export function SettingsToggleField({
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
		<Field orientation="responsive">
			<FieldContent>
				<FieldLabel htmlFor={id}>{label}</FieldLabel>
				{description ? (
					<FieldDescription>{description}</FieldDescription>
				) : null}
			</FieldContent>
			{/* Keep size-4: Field's `*:w-full` would stretch a bare Checkbox. */}
			<div className="flex shrink-0 items-center">
				<Checkbox
					id={id}
					checked={checked}
					onCheckedChange={(value) => onCheckedChange(value === true)}
				/>
			</div>
		</Field>
	);
}

function minutesAsHoursLabel(minutes: number): string {
	if (minutes % 60 !== 0) return `${minutes} minutes`;
	const hours = minutes / 60;
	return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function WorkplaceCard({
	settings,
	isLoading,
	onChange,
}: {
	settings: WorkplaceSettings | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	const [name, setName] = useState<string | null>(null);
	const [hours, setHours] = useState<number | null>(null);
	const [weekStartDay, setWeekStartDay] = useState<string | null>(null);
	const [payPeriodType, setPayPeriodType] = useState<string | null>(null);
	const [anchor, setAnchor] = useState<string | null>(null);
	const [overtimeWeeklyMinutes, setOvertimeWeeklyMinutes] = useState<
		number | null
	>(null);
	const [overtimeDailyMinutes, setOvertimeDailyMinutes] = useState<
		number | null
	>(null);
	const [laborCostPercentGoal, setLaborCostPercentGoal] = useState<
		number | null | undefined
	>(undefined);
	const [managersCanViewLaborCost, setManagersCanViewLaborCost] = useState<
		boolean | null
	>(null);
	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${settings?.id}`, {
				method: "PATCH",
				body: {
					name: name ?? settings?.name,
					noticeWindowHours: hours ?? settings?.noticeWindowHours,
					weekStartDay:
						weekStartDay !== null
							? Number(weekStartDay)
							: settings?.weekStartDay,
					payPeriodType:
						(payPeriodType as
							| "weekly"
							| "biweekly"
							| "semimonthly"
							| "monthly"
							| null) ?? settings?.payPeriodType,
					payPeriodAnchor: anchor ?? settings?.payPeriodAnchor,
					overtimeWeeklyMinutes:
						overtimeWeeklyMinutes ?? settings?.overtimeWeeklyMinutes,
					overtimeDailyMinutes:
						overtimeDailyMinutes ?? settings?.overtimeDailyMinutes,
					laborCostPercentGoal:
						laborCostPercentGoal === undefined
							? settings?.laborCostPercentGoal
							: laborCostPercentGoal,
					managersCanViewLaborCost:
						managersCanViewLaborCost ?? settings?.managersCanViewLaborCost,
				},
			}),
		onSuccess: () => {
			setName(null);
			setHours(null);
			setWeekStartDay(null);
			setPayPeriodType(null);
			setAnchor(null);
			setOvertimeWeeklyMinutes(null);
			setOvertimeDailyMinutes(null);
			setLaborCostPercentGoal(undefined);
			setManagersCanViewLaborCost(null);
			onChange();
			toast.success("Workplace settings saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const dirty =
		name !== null ||
		hours !== null ||
		weekStartDay !== null ||
		payPeriodType !== null ||
		anchor !== null ||
		overtimeWeeklyMinutes !== null ||
		overtimeDailyMinutes !== null ||
		laborCostPercentGoal !== undefined ||
		managersCanViewLaborCost !== null;

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

	const overtimeMinutes =
		overtimeWeeklyMinutes ?? settings.overtimeWeeklyMinutes;
	const dailyOvertimeMinutes =
		overtimeDailyMinutes ?? settings.overtimeDailyMinutes;
	const laborGoal =
		laborCostPercentGoal === undefined
			? settings.laborCostPercentGoal
			: laborCostPercentGoal;
	const noticeHours = hours ?? settings.noticeWindowHours;
	const saveFooter = (
		<Button disabled={save.isPending || !dirty} onClick={() => save.mutate()}>
			{save.isPending ? <Spinner data-icon="inline-start" /> : null}
			{save.isPending ? "Saving…" : "Save changes"}
		</Button>
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="Identity"
				description="The name people see for this workplace."
			>
				<FieldGroup>
					<SettingsField id="workplace-name" label="Workplace name">
						<Input
							id="workplace-name"
							defaultValue={settings.name}
							onChange={(event) => setName(event.target.value)}
						/>
					</SettingsField>
				</FieldGroup>
			</SettingsSection>

			<SettingsSection
				title="Week & pay"
				description="Schedule grids, week lists, and timecard totals follow these dates."
			>
				<FieldGroup>
					<SettingsField
						id="week-start-day"
						label="Week starts on"
						description="The first column on the schedule and the start of weekly totals."
					>
						<Select
							items={WEEK_START_ITEMS}
							value={String(weekStartDay ?? settings.weekStartDay)}
							onValueChange={(value) => {
								if (!value) return;
								setWeekStartDay(value);
							}}
						>
							<SelectTrigger id="week-start-day" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectGroup>
									{WEEK_START_ITEMS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</SettingsField>
					<SettingsField
						id="pay-period-type"
						label="Pay period"
						description="How often the timecard resets for your team."
					>
						<Select
							items={PAY_PERIOD_ITEMS}
							value={payPeriodType ?? settings.payPeriodType}
							onValueChange={(value) => {
								if (!value) return;
								setPayPeriodType(value);
							}}
						>
							<SelectTrigger id="pay-period-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectGroup>
									{PAY_PERIOD_ITEMS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</SettingsField>
					{((payPeriodType ?? settings.payPeriodType) === "weekly" ||
						(payPeriodType ?? settings.payPeriodType) === "biweekly") && (
						<SettingsField
							id="pay-period-anchor"
							label="Period start date"
							description="A known start of a pay period — periods repeat from this date."
						>
							<DatePicker
								id="pay-period-anchor"
								value={anchor ?? settings.payPeriodAnchor ?? ""}
								onValueChange={(value) => setAnchor(value || null)}
							/>
						</SettingsField>
					)}
				</FieldGroup>
			</SettingsSection>

			<SettingsSection
				title="Labor"
				description="Overtime thresholds and labor-cost targets used in reports and warnings."
			>
				<FieldGroup>
					<SettingsField
						id="weekly-overtime"
						label="Weekly overtime"
						description={`${minutesAsHoursLabel(overtimeMinutes)}. 2,400 minutes is a standard 40-hour week.`}
					>
						<InputGroup>
							<InputGroupInput
								id="weekly-overtime"
								type="number"
								min={0}
								defaultValue={settings.overtimeWeeklyMinutes}
								onChange={(event) =>
									setOvertimeWeeklyMinutes(Number(event.target.value))
								}
							/>
							<InputGroupAddon align="inline-end">min</InputGroupAddon>
						</InputGroup>
					</SettingsField>
					<SettingsField
						id="daily-overtime"
						label="Daily overtime"
						description={`${minutesAsHoursLabel(dailyOvertimeMinutes)}. 480 minutes is an 8-hour day.`}
					>
						<InputGroup>
							<InputGroupInput
								id="daily-overtime"
								type="number"
								min={0}
								defaultValue={settings.overtimeDailyMinutes}
								onChange={(event) =>
									setOvertimeDailyMinutes(Number(event.target.value))
								}
							/>
							<InputGroupAddon align="inline-end">min</InputGroupAddon>
						</InputGroup>
					</SettingsField>
					<SettingsField
						id="labor-cost-goal"
						label="Labor cost goal"
						description="Target labor spend as a percent of sales. Leave empty to hide the goal."
					>
						<InputGroup>
							<InputGroupInput
								id="labor-cost-goal"
								type="number"
								min={0}
								max={100}
								step={1}
								value={laborGoal == null ? "" : String(laborGoal)}
								onChange={(event) => {
									const raw = event.target.value.trim();
									if (raw === "") {
										setLaborCostPercentGoal(null);
										return;
									}
									const next = Math.round(Number(raw));
									if (!Number.isFinite(next)) return;
									setLaborCostPercentGoal(
										Math.min(100, Math.max(0, next)),
									);
								}}
								placeholder="e.g. 25"
							/>
							<InputGroupAddon align="inline-end">%</InputGroupAddon>
						</InputGroup>
					</SettingsField>
					<SettingsToggleField
						id="managers-labor-cost"
						label="Managers can view labor cost"
						description="When off, only owners see labor-cost figures on reports."
						checked={
							managersCanViewLaborCost ?? settings.managersCanViewLaborCost
						}
						onCheckedChange={setManagersCanViewLaborCost}
					/>
				</FieldGroup>
			</SettingsSection>

			<SettingsSection
				title="Late changes"
				description="Material edits inside this window before a shift need explicit acceptance."
			>
				<FieldGroup>
					<SettingsField
						id="notice-window"
						label="Notice window"
						description={`${noticeHours} hour${noticeHours === 1 ? "" : "s"} before a shift. Clock-in rules live under Time clock.`}
					>
						<InputGroup>
							<InputGroupInput
								id="notice-window"
								type="number"
								min={0}
								max={336}
								defaultValue={settings.noticeWindowHours}
								onChange={(event) => setHours(Number(event.target.value))}
							/>
							<InputGroupAddon align="inline-end">hours</InputGroupAddon>
						</InputGroup>
					</SettingsField>
					<p className="text-muted-foreground text-sm">
						Clock-in, rounding, and geofence live under{" "}
						<Link
							to="/dashboard/settings/time-clock"
							className="underline underline-offset-4"
						>
							Time clock
						</Link>
						.
					</p>
				</FieldGroup>
			</SettingsSection>

			<SettingsSaveSection
				message={
					dirty
						? "You have unsaved workplace changes."
						: "These details apply to the whole workplace."
				}
				footer={saveFooter}
			/>
		</div>
	);
}

export function LocationsCard({
	locations,
	isLoading,
	onChange,
}: {
	locations: LocationDto[];
	isLoading: boolean;
	onChange: () => void;
}) {
	const { formatMinute } = useDisplayPrefs();
	const { workplace } = useWorkplace();
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState("America/Chicago");
	const [geo, setGeo] = useState<LocationGeoValue>(EMPTY_GEO);
	const [hoursEnabled, setHoursEnabled] = useState(false);
	const [openMinute, setOpenMinute] = useState(9 * 60);
	const [closeMinute, setCloseMinute] = useState(17 * 60);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editTimezone, setEditTimezone] = useState("America/Chicago");
	const [editGeo, setEditGeo] = useState<LocationGeoValue>(EMPTY_GEO);
	const [editKioskPin, setEditKioskPin] = useState("");
	const [editHoursEnabled, setEditHoursEnabled] = useState(false);
	const [editOpenMinute, setEditOpenMinute] = useState(9 * 60);
	const [editCloseMinute, setEditCloseMinute] = useState(17 * 60);

	const create = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/locations`, {
				method: "POST",
				body: {
					name: name.trim(),
					timezone,
					addressLine: geo.addressLine.trim() || undefined,
					latitude: geo.latitude.trim() || undefined,
					longitude: geo.longitude.trim() || undefined,
					geofenceRadiusMeters: geo.geofenceRadiusMeters
						? Number(geo.geofenceRadiusMeters)
						: null,
					openMinute: hoursEnabled ? openMinute : null,
					closeMinute: hoursEnabled ? closeMinute : null,
				},
			}),
		onSuccess: () => {
			setName("");
			setGeo(EMPTY_GEO);
			setHoursEnabled(false);
			setOpenMinute(9 * 60);
			setCloseMinute(17 * 60);
			onChange();
			toast.success("Location added.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const update = useMutation({
		mutationFn: (input: {
			id: string;
			name: string;
			timezone: string;
			addressLine: string;
			latitude: string;
			longitude: string;
			geofenceRadiusMeters: number | null;
			/** Omit to keep; string to set; null to clear. */
			kioskPin?: string | null;
			openMinute: number | null;
			closeMinute: number | null;
		}) =>
			api(`/v1/locations/${input.id}`, {
				method: "PATCH",
				body: {
					name: input.name,
					timezone: input.timezone,
					addressLine: input.addressLine.trim() || null,
					latitude: input.latitude.trim() || null,
					longitude: input.longitude.trim() || null,
					geofenceRadiusMeters: input.geofenceRadiusMeters,
					...(input.kioskPin !== undefined
						? { kioskPin: input.kioskPin }
						: {}),
					openMinute: input.openMinute,
					closeMinute: input.closeMinute,
				},
			}),
		onSuccess: () => {
			setEditingId(null);
			onChange();
			toast.success("Location updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const remove = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/locations/${id}`, {
				method: "DELETE",
			}),
		onSuccess: (_data, id) => {
			if (editingId === id) setEditingId(null);
			onChange();
			toast.success("Location deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const columns = useMemo(
		() =>
			locationHelper.columns([
				locationHelper.accessor("name", {
					header: "Location",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				locationHelper.accessor("timezone", { header: "Time zone" }),
				locationHelper.accessor(
					(row) =>
						row.openMinute != null && row.closeMinute != null
							? `${formatMinute(row.openMinute)}–${formatMinute(row.closeMinute)}`
							: "",
					{
						id: "hours",
						header: "Hours",
						cell: ({ getValue }) => getValue() || "All day",
					},
				),
				locationHelper.accessor((row) => row.addressLine ?? "", {
					id: "address",
					header: "Address",
					cell: ({ getValue }) => getValue() || "—",
				}),
				locationHelper.accessor(
					(row) =>
						row.geofenceRadiusMeters != null && row.latitude && row.longitude
							? `${row.geofenceRadiusMeters} m`
							: "",
					{
						id: "geofence",
						header: "Geofence",
						cell: ({ getValue }) => getValue() || "—",
					},
				),
				locationHelper.accessor((row) => (row.kioskEnabled ? "Enabled" : ""), {
					id: "kiosk",
					header: "Kiosk",
					cell: ({ getValue }) =>
						getValue() ? <Badge variant="secondary">Enabled</Badge> : "—",
				}),
				locationHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const location = row.original;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setEditingId(location.id);
										setEditName(location.name);
										setEditTimezone(location.timezone);
										setEditGeo({
											addressLine: location.addressLine ?? "",
											latitude: location.latitude ?? "",
											longitude: location.longitude ?? "",
											geofenceRadiusMeters:
												location.geofenceRadiusMeters == null
													? ""
													: String(location.geofenceRadiusMeters),
										});
										setEditKioskPin("");
										const hasHours =
											location.openMinute != null &&
											location.closeMinute != null;
										setEditHoursEnabled(hasHours);
										setEditOpenMinute(location.openMinute ?? 9 * 60);
										setEditCloseMinute(location.closeMinute ?? 17 * 60);
									}}
								>
									Edit
								</Button>
								<ConfirmAction
									trigger="Delete"
									triggerVariant="ghost"
									destructive
									title="Delete this location?"
									description="Locations with schedules cannot be deleted. This cannot be undone."
									confirmLabel="Delete"
									disabled={remove.isPending}
									onConfirm={() => remove.mutate(location.id)}
								/>
							</div>
						);
					},
				}),
			]),
		[formatMinute, remove],
	);

	const editingLocation = locations.find(
		(location) => location.id === editingId,
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All locations"
				description="Every site on this workplace. Kiosk PIN is set when you edit a location."
				count={locations.length}
				action={
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={<Link to="/kiosk" />}
					>
						Open kiosk
					</Button>
				}
			>
				{isLoading ? (
					<div className="grid gap-2">
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<DataTable
							bounded
							columns={columns}
							data={locations}
							getRowId={(row) => row.id}
							empty={
								<Empty className="border border-dashed">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<MapPinIcon />
										</EmptyMedia>
										<EmptyTitle>No locations yet</EmptyTitle>
										<EmptyDescription>
											Add the first location below.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							}
						/>
						{editingLocation ? (
							<>
								<Separator />
								<FieldGroup>
									<div className="flex items-center justify-between gap-2">
										<p className="font-medium text-sm">
											Edit {editingLocation.name}
										</p>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setEditingId(null)}
										>
											Cancel
										</Button>
									</div>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field>
											<FieldLabel
												htmlFor={`edit-location-${editingLocation.id}`}
											>
												Location name
											</FieldLabel>
											<Input
												id={`edit-location-${editingLocation.id}`}
												value={editName}
												onChange={(event) => setEditName(event.target.value)}
											/>
										</Field>
										<Field>
											<FieldLabel
												htmlFor={`edit-timezone-${editingLocation.id}`}
											>
												Time zone
											</FieldLabel>
											<TimezoneSelect
												id={`edit-timezone-${editingLocation.id}`}
												value={editTimezone}
												onValueChange={setEditTimezone}
											/>
										</Field>
										<LocationGeoFields
											idPrefix={`edit-location-geo-${editingLocation.id}`}
											value={editGeo}
											onChange={setEditGeo}
											onTimezone={setEditTimezone}
										/>
										<Field className="sm:col-span-2">
											<div className="flex items-start gap-3">
												<Checkbox
													id={`edit-hours-${editingLocation.id}`}
													checked={editHoursEnabled}
													onCheckedChange={(value) =>
														setEditHoursEnabled(value === true)
													}
												/>
												<div className="grid gap-1">
													<FieldLabel
														htmlFor={`edit-hours-${editingLocation.id}`}
													>
														Hours of operation
													</FieldLabel>
													<FieldDescription>
														Optional open and close times for this location.
													</FieldDescription>
												</div>
											</div>
										</Field>
										{editHoursEnabled ? (
											<>
												<Field>
													<FieldLabel
														htmlFor={`edit-open-${editingLocation.id}`}
													>
														Opens
													</FieldLabel>
													<TimePicker
														id={`edit-open-${editingLocation.id}`}
														value={editOpenMinute}
														onValueChange={setEditOpenMinute}
													/>
												</Field>
												<Field>
													<FieldLabel
														htmlFor={`edit-close-${editingLocation.id}`}
													>
														Closes
													</FieldLabel>
													<TimePicker
														id={`edit-close-${editingLocation.id}`}
														value={editCloseMinute}
														onValueChange={setEditCloseMinute}
														overnightAfterMinute={editOpenMinute}
													/>
												</Field>
											</>
										) : null}
										<Field>
											<FieldLabel
												htmlFor={`edit-kiosk-pin-${editingLocation.id}`}
											>
												Kiosk PIN
											</FieldLabel>
											<Input
												id={`edit-kiosk-pin-${editingLocation.id}`}
												inputMode="numeric"
												pattern="\d{4,8}"
												minLength={4}
												maxLength={8}
												value={editKioskPin}
												onChange={(event) =>
													setEditKioskPin(event.target.value.replace(/\D/g, ""))
												}
												placeholder={
													editingLocation.kioskEnabled
														? "Enter a new PIN"
														: "4–8 digits"
												}
											/>
											<FieldDescription>
												{editingLocation.kioskEnabled
													? "Leave blank to keep the current PIN. Enter a new PIN to change it."
													: "Set a 4–8 digit PIN to enable kiosk clock-in."}
											</FieldDescription>
										</Field>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<Button
											size="sm"
											disabled={update.isPending}
											onClick={() =>
												update.mutate({
													id: editingLocation.id,
													name: editName.trim() || editingLocation.name,
													timezone: editTimezone,
													addressLine: editGeo.addressLine,
													latitude: editGeo.latitude,
													longitude: editGeo.longitude,
													geofenceRadiusMeters: editGeo.geofenceRadiusMeters
														? Number(editGeo.geofenceRadiusMeters)
														: null,
													...(editKioskPin.trim()
														? { kioskPin: editKioskPin.trim() }
														: {}),
													openMinute: editHoursEnabled ? editOpenMinute : null,
													closeMinute: editHoursEnabled
														? editCloseMinute
														: null,
												})
											}
										>
											{update.isPending ? (
												<Spinner data-icon="inline-start" />
											) : null}
											Save location
										</Button>
										{editingLocation.kioskEnabled ? (
											<Button
												size="sm"
												variant="ghost"
												disabled={update.isPending}
												onClick={() =>
													update.mutate({
														id: editingLocation.id,
														name: editName.trim() || editingLocation.name,
														timezone: editTimezone,
														addressLine: editGeo.addressLine,
														latitude: editGeo.latitude,
														longitude: editGeo.longitude,
														geofenceRadiusMeters: editGeo.geofenceRadiusMeters
															? Number(editGeo.geofenceRadiusMeters)
															: null,
														kioskPin: null,
														openMinute: editHoursEnabled
															? editOpenMinute
															: null,
														closeMinute: editHoursEnabled
															? editCloseMinute
															: null,
													})
												}
											>
												Disable kiosk
											</Button>
										) : null}
									</div>
								</FieldGroup>
							</>
						) : null}
					</div>
				)}
			</SettingsSection>

			<SettingsSection
				title="Add location"
				description="Create another place where shifts can be scheduled."
				footer={
					<Button
						type="submit"
						form="add-location-form"
						disabled={create.isPending || !name.trim()}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						{create.isPending ? "Adding…" : "Add location"}
					</Button>
				}
			>
				<form
					id="add-location-form"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate();
					}}
				>
					<FieldGroup className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="location-name">Location name</FieldLabel>
							<Input
								id="location-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Domain"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="location-timezone">Time zone</FieldLabel>
							<TimezoneSelect
								id="location-timezone"
								value={timezone}
								onValueChange={setTimezone}
							/>
						</Field>
						<LocationGeoFields
							idPrefix="add-location"
							value={geo}
							onChange={setGeo}
							onTimezone={setTimezone}
						/>
						<Field className="sm:col-span-2">
							<div className="flex items-start gap-3">
								<Checkbox
									id="add-location-hours"
									checked={hoursEnabled}
									onCheckedChange={(value) => setHoursEnabled(value === true)}
								/>
								<div className="grid gap-1">
									<FieldLabel htmlFor="add-location-hours">
										Hours of operation
									</FieldLabel>
									<FieldDescription>
										Optional open and close times for this location.
									</FieldDescription>
								</div>
							</div>
						</Field>
						{hoursEnabled ? (
							<>
								<Field>
									<FieldLabel htmlFor="add-location-open">Opens</FieldLabel>
									<TimePicker
										id="add-location-open"
										value={openMinute}
										onValueChange={setOpenMinute}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="add-location-close">Closes</FieldLabel>
									<TimePicker
										id="add-location-close"
										value={closeMinute}
										onValueChange={setCloseMinute}
										overnightAfterMinute={openMinute}
									/>
								</Field>
							</>
						) : null}
					</FieldGroup>
				</form>
			</SettingsSection>
		</div>
	);
}

export function PositionsCard({
	positions,
	isLoading,
	onChange,
}: {
	positions: PositionDto[];
	isLoading: boolean;
	onChange: () => void;
}) {
	const { workplace } = useWorkplace();
	const [name, setName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");

	const create = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/positions`, {
				method: "POST",
				body: {
					name: name.trim(),
				},
			}),
		onSuccess: () => {
			setName("");
			onChange();
			toast.success("Position added.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const update = useMutation({
		mutationFn: (input: { id: string; name: string }) =>
			api(`/v1/positions/${input.id}`, {
				method: "PATCH",
				body: { name: input.name },
			}),
		onSuccess: () => {
			setEditingId(null);
			onChange();
			toast.success("Position updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const remove = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/positions/${id}`, {
				method: "DELETE",
			}),
		onSuccess: (_data, id) => {
			if (editingId === id) setEditingId(null);
			onChange();
			toast.success("Position deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const columns = useMemo(
		() =>
			positionHelper.columns([
				positionHelper.accessor("name", {
					header: "Position",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				positionHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const position = row.original;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setEditingId(position.id);
										setEditName(position.name);
									}}
								>
									Edit
								</Button>
								<ConfirmAction
									trigger="Delete"
									triggerVariant="ghost"
									destructive
									title="Delete this position?"
									description="Positions used by shifts, templates, or workers cannot be deleted. This cannot be undone."
									confirmLabel="Delete"
									disabled={remove.isPending}
									onConfirm={() => remove.mutate(position.id)}
								/>
							</div>
						);
					},
				}),
			]),
		[remove],
	);

	const editingPosition = positions.find(
		(position) => position.id === editingId,
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All positions"
				description="Roles that can be assigned to a shift."
				count={positions.length}
			>
				{isLoading ? (
					<div className="grid gap-2">
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<DataTable
							bounded
							columns={columns}
							data={positions}
							getRowId={(row) => row.id}
							empty={
								<Empty className="border border-dashed">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<TagsIcon />
										</EmptyMedia>
										<EmptyTitle>No positions yet</EmptyTitle>
										<EmptyDescription>
											Add the first role below.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							}
						/>
						{editingPosition ? (
							<>
								<Separator />
								<FieldGroup>
									<div className="flex items-center justify-between gap-2">
										<p className="font-medium text-sm">
											Edit {editingPosition.name}
										</p>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setEditingId(null)}
										>
											Cancel
										</Button>
									</div>
									<Field>
										<FieldLabel htmlFor={`edit-position-${editingPosition.id}`}>
											Position name
										</FieldLabel>
										<Input
											id={`edit-position-${editingPosition.id}`}
											value={editName}
											onChange={(event) => setEditName(event.target.value)}
										/>
									</Field>
									<div>
										<Button
											size="sm"
											disabled={update.isPending}
											onClick={() =>
												update.mutate({
													id: editingPosition.id,
													name: editName.trim() || editingPosition.name,
												})
											}
										>
											{update.isPending ? (
												<Spinner data-icon="inline-start" />
											) : null}
											Save position
										</Button>
									</div>
								</FieldGroup>
							</>
						) : null}
					</div>
				)}
			</SettingsSection>

			<SettingsSection
				title="Add position"
				description="Create a role that can be assigned to a shift. Use Groups to filter who appears on the schedule."
				footer={
					<Button
						type="submit"
						form="add-position-form"
						disabled={create.isPending || !name.trim()}
					>
						{create.isPending ? <Spinner data-icon="inline-start" /> : null}
						{create.isPending ? "Adding…" : "Add position"}
					</Button>
				}
			>
				<form
					id="add-position-form"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="position-name">Position name</FieldLabel>
							<Input
								id="position-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Associate"
								required
							/>
						</Field>
					</FieldGroup>
				</form>
			</SettingsSection>
		</div>
	);
}
