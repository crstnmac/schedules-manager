import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
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
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPinIcon, TagsIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import {
	LocationGeoFields,
	type LocationGeoValue,
} from "@/components/location-geo-fields";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import {
	SettingsColumns,
	SettingsSaveSection,
	SettingsSection,
} from "@/components/settings/page";
import { TimePicker } from "@/components/time-picker";
import { TimezoneSelect } from "@/components/timezone-select";
import { useRegisterUnsavedChanges } from "@/components/unsaved-changes";
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

const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between";

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
					aria-label={label}
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
	useRegisterUnsavedChanges("workplace", dirty);

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
			<SettingsColumns>
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
							label="Weekly overtime after"
							description={`Overtime pay starts after ${minutesAsHoursLabel(overtimeMinutes)} in a workweek.`}
						>
							<InputGroup>
								<InputGroupInput
									id="weekly-overtime"
									type="number"
									min={0}
									step={0.5}
									defaultValue={(settings.overtimeWeeklyMinutes ?? 0) / 60}
									onChange={(event) => {
										const hours = Number(event.target.value);
										setOvertimeWeeklyMinutes(
											Number.isFinite(hours) ? Math.round(hours * 60) : 0,
										);
									}}
								/>
								<InputGroupAddon align="inline-end">hr</InputGroupAddon>
							</InputGroup>
						</SettingsField>
						<SettingsField
							id="daily-overtime"
							label="Daily overtime after"
							description={`Overtime pay starts after ${minutesAsHoursLabel(dailyOvertimeMinutes)} in a day.`}
						>
							<InputGroup>
								<InputGroupInput
									id="daily-overtime"
									type="number"
									min={0}
									step={0.5}
									defaultValue={(settings.overtimeDailyMinutes ?? 0) / 60}
									onChange={(event) => {
										const hours = Number(event.target.value);
										setOvertimeDailyMinutes(
											Number.isFinite(hours) ? Math.round(hours * 60) : 0,
										);
									}}
								/>
								<InputGroupAddon align="inline-end">hr</InputGroupAddon>
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
										setLaborCostPercentGoal(Math.min(100, Math.max(0, next)));
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
			</SettingsColumns>

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
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
	);
	const [geo, setGeo] = useState<LocationGeoValue>(EMPTY_GEO);
	const [hoursEnabled, setHoursEnabled] = useState(false);
	const [openMinute, setOpenMinute] = useState(9 * 60);
	const [closeMinute, setCloseMinute] = useState(17 * 60);
	const [kioskPin, setKioskPin] = useState("");

	const editingLocation = locations.find(
		(location) => location.id === editingId,
	);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
		setGeo(EMPTY_GEO);
		setHoursEnabled(false);
		setOpenMinute(9 * 60);
		setCloseMinute(17 * 60);
		setKioskPin("");
	}, []);

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
			resetForm();
			setOpen(false);
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
					...(input.kioskPin !== undefined ? { kioskPin: input.kioskPin } : {}),
					openMinute: input.openMinute,
					closeMinute: input.closeMinute,
				},
			}),
		onSuccess: () => {
			resetForm();
			setOpen(false);
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
		onSuccess: () => {
			onChange();
			toast.success("Location deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (location: LocationDto) => {
		setEditingId(location.id);
		setName(location.name);
		setTimezone(location.timezone);
		setGeo({
			addressLine: location.addressLine ?? "",
			latitude: location.latitude ?? "",
			longitude: location.longitude ?? "",
			geofenceRadiusMeters:
				location.geofenceRadiusMeters == null
					? ""
					: String(location.geofenceRadiusMeters),
		});
		const hasHours =
			location.openMinute != null && location.closeMinute != null;
		setHoursEnabled(hasHours);
		setOpenMinute(location.openMinute ?? 9 * 60);
		setCloseMinute(location.closeMinute ?? 17 * 60);
		setKioskPin("");
		setOpen(true);
	};

	const submitEdit = (kioskOverride?: string | null) => {
		if (!editingLocation) return;
		update.mutate({
			id: editingLocation.id,
			name: name.trim() || editingLocation.name,
			timezone,
			addressLine: geo.addressLine,
			latitude: geo.latitude,
			longitude: geo.longitude,
			geofenceRadiusMeters: geo.geofenceRadiusMeters
				? Number(geo.geofenceRadiusMeters)
				: null,
			...(kioskOverride !== undefined
				? { kioskPin: kioskOverride }
				: kioskPin.trim()
					? { kioskPin: kioskPin.trim() }
					: {}),
			openMinute: hoursEnabled ? openMinute : null,
			closeMinute: hoursEnabled ? closeMinute : null,
		});
	};

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
			]),
		[formatMinute],
	);

	const saving = create.isPending || update.isPending;

	return (
		<>
			<SettingsCrudCard
				title="All locations"
				description="Every site on this workplace. Kiosk PIN is set when you edit a location."
				count={locations.length}
				data={locations}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) =>
					`${row.name} ${row.timezone} ${row.addressLine ?? ""}`
				}
				searchPlaceholder="Search locations"
				isLoading={isLoading}
				entityLabel="location"
				emptyIcon={<MapPinIcon />}
				emptyTitle="No locations yet"
				emptyDescription="Add the first site where shifts can be scheduled."
				addLabel="Add location"
				onAdd={startAdd}
				headerAction={
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={<Link to="/kiosk" />}
					>
						Open kiosk
					</Button>
				}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this location?",
					deleteDescription:
						"Locations with schedules cannot be deleted. This cannot be undone.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit location" : "Add location"}
				description={
					editingId
						? "Update this site's address, hours, and kiosk PIN."
						: "Create another place where shifts can be scheduled."
				}
				footer={
					<div className={sheetFooterClassName}>
						<div>
							{editingLocation?.kioskEnabled ? (
								<Button
									type="button"
									variant="outline"
									disabled={saving}
									onClick={() => submitEdit(null)}
								>
									Disable kiosk
								</Button>
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
								form="location-form"
								disabled={saving || !name.trim()}
							>
								{saving ? <Spinner data-icon="inline-start" /> : null}
								{editingId ? "Save location" : "Add location"}
							</Button>
						</div>
					</div>
				}
			>
				<form
					id="location-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (editingId) submitEdit();
						else create.mutate();
					}}
				>
					<FieldGroup className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="location-name">Location name</FieldLabel>
							<Input
								id="location-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Location name"
								autoFocus
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
							idPrefix="location-geo"
							value={geo}
							onChange={setGeo}
							onTimezone={setTimezone}
						/>
						<Field className="sm:col-span-2">
							<div className="flex items-start gap-3">
								<Checkbox
									id="location-hours"
									checked={hoursEnabled}
									onCheckedChange={(value) => setHoursEnabled(value === true)}
								/>
								<div className="grid gap-1">
									<FieldLabel htmlFor="location-hours">
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
									<FieldLabel htmlFor="location-open">Opens</FieldLabel>
									<TimePicker
										id="location-open"
										value={openMinute}
										onValueChange={setOpenMinute}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="location-close">Closes</FieldLabel>
									<TimePicker
										id="location-close"
										value={closeMinute}
										onValueChange={setCloseMinute}
										overnightAfterMinute={openMinute}
									/>
								</Field>
							</>
						) : null}
						{editingLocation ? (
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor="location-kiosk-pin">Kiosk PIN</FieldLabel>
								<Input
									id="location-kiosk-pin"
									inputMode="numeric"
									pattern="\d{4,8}"
									minLength={4}
									maxLength={8}
									value={kioskPin}
									onChange={(event) =>
										setKioskPin(event.target.value.replace(/\D/g, ""))
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
						) : null}
					</FieldGroup>
				</form>
			</SettingsFormSheet>
		</>
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
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
	}, []);

	const create = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/positions`, {
				method: "POST",
				body: {
					name: name.trim(),
				},
			}),
		onSuccess: () => {
			resetForm();
			setOpen(false);
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
			resetForm();
			setOpen(false);
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
		onSuccess: () => {
			onChange();
			toast.success("Position deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (position: PositionDto) => {
		setEditingId(position.id);
		setName(position.name);
		setOpen(true);
	};

	const columns = useMemo(
		() =>
			positionHelper.columns([
				positionHelper.accessor("name", {
					header: "Position",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
			]),
		[],
	);

	const saving = create.isPending || update.isPending;

	return (
		<>
			<SettingsCrudCard
				title="All positions"
				description="Roles that can be assigned to a shift."
				count={positions.length}
				data={positions}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => row.name}
				searchPlaceholder="Search positions"
				isLoading={isLoading}
				entityLabel="position"
				emptyIcon={<TagsIcon />}
				emptyTitle="No positions yet"
				emptyDescription="Roles people can be scheduled into. Add your first one."
				addLabel="Add position"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this position?",
					deleteDescription:
						"Positions used by shifts, templates, or workers cannot be deleted. This cannot be undone.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit position" : "Add position"}
				description={
					editingId
						? "Update this role's name."
						: "Create a role that can be assigned to a shift. Use Groups to filter who appears on the schedule."
				}
				footer={
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
							form="position-form"
							disabled={saving || !name.trim()}
						>
							{saving ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save position" : "Add position"}
						</Button>
					</div>
				}
			>
				<form
					id="position-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (editingId) update.mutate({ id: editingId, name: name.trim() });
						else create.mutate();
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
								autoFocus
								required
							/>
						</Field>
					</FieldGroup>
				</form>
			</SettingsFormSheet>
		</>
	);
}
