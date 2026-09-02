import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
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
	FieldLegend,
	FieldSeparator,
	FieldSet,
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

import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import {
	LocationGeoFields,
	type LocationGeoValue,
} from "@/components/location-geo-fields";
import { SettingsSection } from "@/components/settings/page";
import { TimezoneSelect } from "@/components/timezone-select";
import { api } from "@/lib/api";
import type { LocationDto, PositionDto } from "@/lib/queries";
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

function SettingsField({
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

export function WorkplaceCard({
	settings,
	isLoading,
	onChange,
}: {
	settings:
		| {
				id: string;
				name: string;
				noticeWindowHours: number;
				weekStartDay: number;
				payPeriodType: "weekly" | "biweekly" | "semimonthly" | "monthly";
				payPeriodAnchor: string | null;
				earlyClockInMinutes: number;
				clockRoundMinutes: number;
				autoClockOutGraceMinutes: number;
				overtimeWeeklyMinutes: number;
		  }
		| undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	const [name, setName] = useState<string | null>(null);
	const [hours, setHours] = useState<number | null>(null);
	const [weekStartDay, setWeekStartDay] = useState<string | null>(null);
	const [payPeriodType, setPayPeriodType] = useState<string | null>(null);
	const [anchor, setAnchor] = useState<string | null>(null);
	const [earlyClockInMinutes, setEarlyClockInMinutes] = useState<number | null>(
		null,
	);
	const [clockRoundMinutes, setClockRoundMinutes] = useState<number | null>(
		null,
	);
	const [autoClockOutGraceMinutes, setAutoClockOutGraceMinutes] = useState<
		number | null
	>(null);
	const [overtimeWeeklyMinutes, setOvertimeWeeklyMinutes] = useState<
		number | null
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
					earlyClockInMinutes:
						earlyClockInMinutes ?? settings?.earlyClockInMinutes,
					clockRoundMinutes: clockRoundMinutes ?? settings?.clockRoundMinutes,
					autoClockOutGraceMinutes:
						autoClockOutGraceMinutes ?? settings?.autoClockOutGraceMinutes,
					overtimeWeeklyMinutes:
						overtimeWeeklyMinutes ?? settings?.overtimeWeeklyMinutes,
				},
			}),
		onSuccess: () => {
			setName(null);
			setHours(null);
			setWeekStartDay(null);
			setPayPeriodType(null);
			setAnchor(null);
			setEarlyClockInMinutes(null);
			setClockRoundMinutes(null);
			setAutoClockOutGraceMinutes(null);
			setOvertimeWeeklyMinutes(null);
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
		earlyClockInMinutes !== null ||
		clockRoundMinutes !== null ||
		autoClockOutGraceMinutes !== null ||
		overtimeWeeklyMinutes !== null;

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
			<SettingsSection
				footer={
					<Button
						disabled={save.isPending || !dirty}
						onClick={() => save.mutate()}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{save.isPending ? "Saving…" : "Save changes"}
					</Button>
				}
			>
				<FieldGroup>
					<FieldSet>
						<FieldLegend variant="label">Identity</FieldLegend>
						<SettingsField id="workplace-name" label="Workplace name">
							<Input
								id="workplace-name"
								defaultValue={settings.name}
								onChange={(event) => setName(event.target.value)}
							/>
						</SettingsField>
					</FieldSet>

					<FieldSeparator />

					<FieldSet>
						<FieldLegend variant="label">Week & pay</FieldLegend>
						<SettingsField
							id="week-start-day"
							label="Week starts on"
							description="Schedule grids, week lists, and timecard totals follow this day."
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
					</FieldSet>

					<FieldSeparator />

					<FieldSet>
						<FieldLegend variant="label">Timekeeping</FieldLegend>
						<SettingsField
							id="notice-window"
							label="Notice window"
							description="Material changes inside this window before a shift need explicit acceptance."
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
						<SettingsField id="early-clock-in" label="Early clock-in">
							<InputGroup>
								<InputGroupInput
									id="early-clock-in"
									type="number"
									min={0}
									defaultValue={settings.earlyClockInMinutes}
									onChange={(event) =>
										setEarlyClockInMinutes(Number(event.target.value))
									}
								/>
								<InputGroupAddon align="inline-end">min</InputGroupAddon>
							</InputGroup>
						</SettingsField>
						<SettingsField id="clock-round" label="Clock rounding">
							<InputGroup>
								<InputGroupInput
									id="clock-round"
									type="number"
									min={0}
									defaultValue={settings.clockRoundMinutes}
									onChange={(event) =>
										setClockRoundMinutes(Number(event.target.value))
									}
								/>
								<InputGroupAddon align="inline-end">min</InputGroupAddon>
							</InputGroup>
						</SettingsField>
						<SettingsField
							id="auto-clock-out"
							label="Auto clock-out grace"
							description="Close forgotten open punches this many minutes after the published shift ends. Set 0 to disable. Auto-closed punches stay pending for review."
						>
							<InputGroup>
								<InputGroupInput
									id="auto-clock-out"
									type="number"
									min={0}
									max={720}
									defaultValue={settings.autoClockOutGraceMinutes ?? 30}
									onChange={(event) =>
										setAutoClockOutGraceMinutes(Number(event.target.value))
									}
								/>
								<InputGroupAddon align="inline-end">min</InputGroupAddon>
							</InputGroup>
						</SettingsField>
						<SettingsField
							id="weekly-overtime"
							label="Weekly overtime"
							description="2,400 minutes is a standard 40-hour week."
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
					</FieldSet>
				</FieldGroup>
			</SettingsSection>
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
	const { workplace } = useWorkplace();
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState("America/Chicago");
	const [geo, setGeo] = useState<LocationGeoValue>(EMPTY_GEO);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editTimezone, setEditTimezone] = useState("America/Chicago");
	const [editGeo, setEditGeo] = useState<LocationGeoValue>(EMPTY_GEO);
	const [editKioskPin, setEditKioskPin] = useState("");

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
				},
			}),
		onSuccess: () => {
			setName("");
			setGeo(EMPTY_GEO);
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
			kioskPin: string | null;
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
					kioskPin: input.kioskPin,
				},
			}),
		onSuccess: () => {
			setEditingId(null);
			onChange();
			toast.success("Location updated.");
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
							<div className="flex justify-end">
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
									}}
								>
									Edit
								</Button>
							</div>
						);
					},
				}),
			]),
		[],
	);

	const editingLocation = locations.find(
		(location) => location.id === editingId,
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All locations"
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
													? "Kiosk is enabled. Leave empty to disable it."
													: "Set a PIN to enable this location for kiosk use."}
											</FieldDescription>
										</Field>
									</div>
									<div>
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
													kioskPin: editKioskPin || null,
												})
											}
										>
											{update.isPending ? (
												<Spinner data-icon="inline-start" />
											) : null}
											Save location
										</Button>
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
							<div className="flex justify-end">
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
							</div>
						);
					},
				}),
			]),
		[],
	);

	const editingPosition = positions.find(
		(position) => position.id === editingId,
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection title="All positions" count={positions.length}>
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
										<FieldLabel
											htmlFor={`edit-position-${editingPosition.id}`}
										>
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
				description="Create a role that can be assigned to a shift. Use Worker Groups in settings to filter who appears on the Schedule."
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
