import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Field,
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
	type Dispatch,
	memo,
	type SetStateAction,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import { ListToolbar, useListView } from "@/components/list-view";
import { TimePicker } from "@/components/time-picker";
import { formatDay, WEEKDAY_NAMES } from "@/lib/time";
import { useStablePrefs } from "../-shared/use-stable-prefs";
import {
	type DateWindow,
	type RecurringWindow,
	searchUnavailability,
	UNAVAILABILITY_FILTERS,
	UNAVAILABILITY_SORTS,
	type UnavailabilityRow,
	unavailabilityHelper,
	unavailabilityId,
	WEEKDAY_ITEMS,
	windowId,
} from "./shared";

/** Add-window forms. Their draft inputs are local so typing never re-renders the table. */
const AddWindowForms = memo(function AddWindowForms({
	setRecurring,
	setDates,
}: {
	setRecurring: Dispatch<SetStateAction<RecurringWindow[]>>;
	setDates: Dispatch<SetStateAction<DateWindow[]>>;
}) {
	const [weekday, setWeekday] = useState(0);
	const [recurringStart, setRecurringStart] = useState(8 * 60);
	const [recurringEnd, setRecurringEnd] = useState(14 * 60);
	const [recurringNote, setRecurringNote] = useState("");
	const [date, setDate] = useState("");
	const [dateStart, setDateStart] = useState(8 * 60);
	const [dateEnd, setDateEnd] = useState(14 * 60);
	const [dateNote, setDateNote] = useState("");
	function addRecurring() {
		if (recurringStart >= recurringEnd) {
			toast.error("Choose a valid time range.");
			return;
		}
		const entry: RecurringWindow = {
			id: windowId(),
			weekday,
			startMinute: recurringStart,
			endMinute: recurringEnd,
			note: recurringNote.trim() || undefined,
			status: "pending",
		};
		setRecurring((current) => [...current, entry]);
		setRecurringNote("");
	}

	function addDate() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			toast.error("Choose a date.");
			return;
		}
		if (dateStart >= dateEnd) {
			toast.error("Choose a valid time range.");
			return;
		}
		const entry: DateWindow = {
			id: windowId(),
			date,
			startMinute: dateStart,
			endMinute: dateEnd,
			note: dateNote.trim() || undefined,
			status: "pending",
		};
		setDates((current) => [...current, entry]);
		setDate("");
		setDateNote("");
	}

	return (
		<>
			<FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<Field>
					<FieldLabel htmlFor="weekly-day">Every</FieldLabel>
					<Select
						items={WEEKDAY_ITEMS}
						value={String(weekday)}
						onValueChange={(value) => {
							if (value == null) return;
							setWeekday(Number(value));
						}}
					>
						<SelectTrigger id="weekly-day" className="w-full">
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
				<Field>
					<FieldLabel htmlFor="weekly-start">From</FieldLabel>
					<TimePicker
						id="weekly-start"
						value={recurringStart}
						onValueChange={setRecurringStart}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="weekly-end">Until</FieldLabel>
					<TimePicker
						id="weekly-end"
						value={recurringEnd}
						onValueChange={setRecurringEnd}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="weekly-note">Note</FieldLabel>
					<Input
						id="weekly-note"
						value={recurringNote}
						onChange={(event) => setRecurringNote(event.target.value)}
						placeholder="Optional"
					/>
				</Field>
				<Button type="button" variant="outline" onClick={addRecurring}>
					Add weekly window
				</Button>
			</FieldGroup>
			<FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<Field>
					<FieldLabel htmlFor="date-exception">Date</FieldLabel>
					<DatePicker
						id="date-exception"
						value={date}
						onValueChange={setDate}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="date-start">From</FieldLabel>
					<TimePicker
						id="date-start"
						value={dateStart}
						onValueChange={setDateStart}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="date-end">Until</FieldLabel>
					<TimePicker
						id="date-end"
						value={dateEnd}
						onValueChange={setDateEnd}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="date-note">Note</FieldLabel>
					<Input
						id="date-note"
						value={dateNote}
						onChange={(event) => setDateNote(event.target.value)}
						placeholder="Optional"
					/>
				</Field>
				<Button type="button" variant="outline" onClick={addDate}>
					Add date exception
				</Button>
			</FieldGroup>
		</>
	);
});

export const UnavailabilityCard = memo(function UnavailabilityCard({
	recurring,
	dates,
	setRecurring,
	setDates,
	dirty,
	saving,
	onSave,
}: {
	recurring: RecurringWindow[];
	dates: DateWindow[];
	setRecurring: Dispatch<SetStateAction<RecurringWindow[]>>;
	setDates: Dispatch<SetStateAction<DateWindow[]>>;
	dirty: boolean;
	saving: boolean;
	onSave: () => void;
}) {
	const { formatMinute } = useStablePrefs();
	const unavailabilityRows = useMemo(
		() => [
			...recurring.map((item) => ({
				id: item.id,
				kind: "weekly" as const,
				window: `Every ${WEEKDAY_NAMES[item.weekday]} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`,
				status: item.status ?? ("pending" as const),
				note: item.note ?? null,
			})),
			...dates.map((item) => ({
				id: item.id,
				kind: "date" as const,
				window: `${formatDay(item.date)} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`,
				status: item.status ?? ("pending" as const),
				note: item.note ?? null,
			})),
		],
		[dates, formatMinute, recurring],
	);
	const unavailabilityColumns = useMemo(
		() =>
			unavailabilityHelper.columns([
				unavailabilityHelper.accessor("kind", {
					header: "Kind",
					cell: ({ getValue }) => (getValue() === "weekly" ? "Weekly" : "Date"),
				}),
				unavailabilityHelper.accessor("window", {
					header: "Window",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				unavailabilityHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => {
						const status = getValue();
						return (
							<Badge
								className="uppercase"
								variant={status === "approved" ? "default" : "secondary"}
							>
								{status}
							</Badge>
						);
					},
				}),
				unavailabilityHelper.accessor("note", {
					header: "Note",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue() || "—"}</span>
					),
				}),
				unavailabilityHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex justify-end">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									if (row.original.kind === "weekly") {
										setRecurring((current) =>
											current.filter((other) => other.id !== row.original.id),
										);
										return;
									}
									setDates((current) =>
										current.filter((other) => other.id !== row.original.id),
									);
								}}
							>
								Remove
							</Button>
						</div>
					),
				}),
			]),
		[setDates, setRecurring],
	);
	const unavailabilityList = useListView<UnavailabilityRow>({
		rows: unavailabilityRows,
		getRowId: unavailabilityId,
		search: searchUnavailability,
		filters: UNAVAILABILITY_FILTERS,
		sorts: UNAVAILABILITY_SORTS,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>When you can't work</CardTitle>
				<CardDescription>
					A hard constraint. Your manager should not schedule you during these
					times unless they record an override.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<ListToolbar
					embedded
					list={unavailabilityList}
					searchPlaceholder="Search windows"
				/>
				<DataTable
					stacked
					bounded
					fill={false}
					columns={unavailabilityColumns}
					list={unavailabilityList}
					data={unavailabilityList.pagination.pageRows}
					getRowId={unavailabilityId}
					empty={
						<p className="text-muted-foreground text-sm">
							{unavailabilityRows.length === 0
								? "No unavailability added."
								: "No windows match your search."}
						</p>
					}
				/>
				<AddWindowForms setRecurring={setRecurring} setDates={setDates} />
			</CardContent>
			<CardFooter>
				<div className="flex items-center gap-2">
					<Button disabled={saving} onClick={onSave}>
						{saving ? <Spinner data-icon="inline-start" /> : null}
						Save unavailability
					</Button>
					{dirty ? <Badge variant="secondary">Unsaved changes</Badge> : null}
				</div>
			</CardFooter>
		</Card>
	);
});
