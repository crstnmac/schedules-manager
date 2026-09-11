import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
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
import { CalendarOffIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import type { LocationDto } from "@/lib/queries";
import {
	type HolidayDto,
	useCreateHoliday,
	useDeleteHoliday,
	useUpdateHoliday,
} from "@/lib/queries";

const holidayHelper = createDataColumnHelper<HolidayDto>();
const ALL_LOCATIONS = "all";

const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

function formatHolidayDate(date: string): string {
	const parsed = new Date(`${date}T12:00:00`);
	return parsed.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function HolidaysCard({
	workplaceId,
	holidays,
	locations,
}: {
	workplaceId: string | undefined;
	holidays: HolidayDto[];
	locations: LocationDto[];
}) {
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [date, setDate] = useState("");
	const [recurring, setRecurring] = useState(false);
	const [locationId, setLocationId] = useState<string>(ALL_LOCATIONS);

	const create = useCreateHoliday(workplaceId);
	const update = useUpdateHoliday(workplaceId);
	const remove = useDeleteHoliday(workplaceId);
	const savePending = create.isPending || update.isPending;

	const locationNameById = useMemo(
		() => new Map(locations.map((location) => [location.id, location.name])),
		[locations],
	);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setDate("");
		setRecurring(false);
		setLocationId(ALL_LOCATIONS);
	}, []);

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (holiday: HolidayDto) => {
		setEditingId(holiday.id);
		setName(holiday.name);
		setDate(holiday.date);
		setRecurring(holiday.recurring);
		setLocationId(holiday.locationId ?? ALL_LOCATIONS);
		setOpen(true);
	};

	const submit = () => {
		const payload = {
			name: name.trim(),
			date,
			recurring,
			locationId: locationId === ALL_LOCATIONS ? null : locationId,
		};
		const options = {
			onSuccess: () => {
				resetForm();
				setOpen(false);
				toast.success("Holiday saved.");
			},
			onError: (error: Error) => toast.error(error.message),
		};
		if (editingId) {
			update.mutate({ holidayId: editingId, ...payload }, options);
		} else {
			create.mutate(payload, options);
		}
	};

	const columns = useMemo(
		() =>
			holidayHelper.columns([
				holidayHelper.accessor("name", {
					header: "Holiday",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				holidayHelper.accessor("date", {
					header: "Date",
					cell: ({ row }) => (
						<span className="tabular-nums">
							{formatHolidayDate(row.original.date)}
						</span>
					),
				}),
				holidayHelper.accessor("recurring", {
					header: "Repeats",
					cell: ({ getValue }) => (getValue() ? "Every year" : "One time"),
				}),
				holidayHelper.accessor("locationId", {
					header: "Location",
					cell: ({ getValue }) => {
						const id = getValue();
						return id
							? (locationNameById.get(id) ?? "Unknown")
							: "All locations";
					},
				}),
			]),
		[locationNameById],
	);

	return (
		<>
			<SettingsCrudCard
				title="Holidays"
				description="Holidays appear as context on the schedule so Managers can plan around closures and low coverage."
				count={holidays.length}
				data={holidays}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => `${row.name} ${row.date}`}
				searchPlaceholder="Search holidays"
				entityLabel="holiday"
				emptyIcon={<CalendarOffIcon />}
				emptyTitle="No holidays yet"
				emptyDescription="Add the days this Workplace does not operate normally."
				addLabel="Add holiday"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this holiday?",
					deleteDescription:
						"It will no longer appear as context on the schedule. Published schedules are unchanged.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit holiday" : "Add holiday"}
				description="Recurring holidays repeat every year on the same month and day."
				footer={
					<div className={sheetFooterClassName}>
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
							form="holiday-form"
							disabled={!name.trim() || !date || savePending}
						>
							{savePending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save holiday" : "Add holiday"}
						</Button>
					</div>
				}
			>
				<form
					id="holiday-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<Field>
						<FieldLabel htmlFor="holiday-name">Name</FieldLabel>
						<Input
							id="holiday-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Thanksgiving"
							autoFocus
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="holiday-date">Date</FieldLabel>
						<Input
							id="holiday-date"
							type="date"
							value={date}
							onChange={(event) => setDate(event.target.value)}
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="holiday-location">Location</FieldLabel>
						<Select
							items={[
								{ label: "All locations", value: ALL_LOCATIONS },
								...locations.map((location) => ({
									label: location.name,
									value: location.id,
								})),
							]}
							value={locationId}
							onValueChange={(value) => value && setLocationId(value)}
						>
							<SelectTrigger id="holiday-location" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
									{locations.map((location) => (
										<SelectItem key={location.id} value={location.id}>
											{location.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field orientation="horizontal" className="items-center">
						<Checkbox
							id="holiday-recurring"
							checked={recurring}
							onCheckedChange={(checked) => setRecurring(checked === true)}
						/>
						<FieldLabel htmlFor="holiday-recurring" className="font-normal">
							Repeats every year
						</FieldLabel>
					</Field>
				</form>
			</SettingsFormSheet>
		</>
	);
}
