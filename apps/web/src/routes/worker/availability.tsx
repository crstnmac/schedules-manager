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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@SchedulesManager/ui/components/sheet";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import {
	LeaveWindowFields,
	leaveChargeMinutes,
} from "@/components/leave-window-fields";
import { PageHeader } from "@/components/page-header";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import { formatLeaveHours, todayIsoDate } from "@/lib/leave";
import {
	useLeaveTypes,
	useMe,
	useMyConstraints,
	usePtoBalances,
	type WorkerConstraints,
} from "@/lib/queries";
import { formatDay, WEEKDAY_NAMES } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

const WEEKDAY_ITEMS = WEEKDAY_NAMES.map((name, index) => ({
	label: name,
	value: String(index),
}));

export const Route = createFileRoute("/worker/availability")({
	component: AvailabilityPage,
});

interface RecurringWindow {
	id: string;
	weekday: number;
	startMinute: number;
	endMinute: number;
	note?: string;
}

interface DateWindow {
	id: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note?: string;
}

type UnavailabilityRow = {
	id: string;
	kind: "weekly" | "date";
	window: string;
};

const unavailabilityHelper = createDataColumnHelper<UnavailabilityRow>();
const timeOffHelper =
	createDataColumnHelper<WorkerConstraints["timeOff"][number]>();

function windowId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function AvailabilityPage() {
	const { workplace } = useWorkplace();
	const { formatMinute, formatLeaveRange } = useDisplayPrefs();
	const canRequestTimeOff =
		workplace?.policies.workersCanRequestTimeOff ?? true;
	const constraints = useMyConstraints(workplace?.id);
	const me = useMe();
	const leaveTypes = useLeaveTypes(workplace?.id);
	const employmentId = me.data?.employments.find(
		(employment) =>
			employment.kind === "worker" && employment.workplace.id === workplace?.id,
	)?.id;
	const pto = usePtoBalances(workplace?.id, employmentId);
	const queryClient = useQueryClient();

	const [recurring, setRecurring] = useState<RecurringWindow[]>([]);
	const [dates, setDates] = useState<DateWindow[]>([]);
	const [preference, setPreference] = useState("");
	const [weekday, setWeekday] = useState(0);
	const [recurringStart, setRecurringStart] = useState(8 * 60);
	const [recurringEnd, setRecurringEnd] = useState(14 * 60);
	const [date, setDate] = useState("");
	const [dateStart, setDateStart] = useState(8 * 60);
	const [dateEnd, setDateEnd] = useState(14 * 60);
	const [offStartDate, setOffStartDate] = useState(todayIsoDate);
	const [offEndDate, setOffEndDate] = useState(todayIsoDate);
	const [offAllDay, setOffAllDay] = useState(true);
	const [offStart, setOffStart] = useState(9 * 60);
	const [offEnd, setOffEnd] = useState(17 * 60);
	const [offReason, setOffReason] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [editing, setEditing] = useState<
		WorkerConstraints["timeOff"][number] | null
	>(null);

	useEffect(() => {
		const data = constraints.data;
		if (!data) return;
		setRecurring(
			data.unavailability
				.filter((row) => row.kind === "recurring")
				.map((row) => ({
					id: row.id,
					weekday: row.weekday ?? 0,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
					note: row.note ?? undefined,
				})),
		);
		setDates(
			data.unavailability
				.filter((row) => row.kind === "date")
				.map((row) => ({
					id: row.id,
					date: row.date ?? "",
					startMinute: row.startMinute,
					endMinute: row.endMinute,
					note: row.note ?? undefined,
				})),
		);
		setPreference(data.preference ?? "");
	}, [constraints.data]);

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: ["constraints", workplace?.id],
		});
	}

	const saveUnavailability = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/my/unavailability`, {
				method: "PUT",
				body: {
					recurring: recurring.map(
						({ weekday, startMinute, endMinute, note }) => ({
							weekday,
							startMinute,
							endMinute,
							note,
						}),
					),
					dates: dates.map(({ date, startMinute, endMinute, note }) => ({
						date,
						startMinute,
						endMinute,
						note,
					})),
				},
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Unavailability saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const savePreference = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/my/preference`, {
				method: "PUT",
				body: { note: preference.trim() === "" ? null : preference.trim() },
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Preference saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const requestTimeOff = useMutation({
		mutationFn: () => {
			if (!offStartDate) {
				throw new Error("Choose a start date.");
			}
			return api(`/v1/workplaces/${workplace?.id}/my/time-off`, {
				method: "POST",
				body: {
					startDate: offStartDate,
					endDate: offEndDate || offStartDate,
					allDay: offAllDay,
					...(offAllDay ? {} : { startMinute: offStart, endMinute: offEnd }),
					reason: offReason.trim() || undefined,
					leaveTypeId,
				},
			});
		},
		onSuccess: () => {
			setOffStartDate(todayIsoDate());
			setOffEndDate(todayIsoDate());
			setOffReason("");
			invalidate();
			toast.success("Time off requested. Your manager will review it.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const cancelTimeOff = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/workplaces/${workplace?.id}/my/time-off/${id}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Request cancelled.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const unavailabilityRows = useMemo(
		() => [
			...recurring.map((item) => ({
				id: item.id,
				kind: "weekly" as const,
				window: `Every ${WEEKDAY_NAMES[item.weekday]} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`,
			})),
			...dates.map((item) => ({
				id: item.id,
				kind: "date" as const,
				window: `${formatDay(item.date)} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`,
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
		[],
	);
	const timeOffColumns = useMemo(
		() =>
			timeOffHelper.columns([
				timeOffHelper.accessor(
					(row) =>
						`${formatLeaveRange(row)} · ${formatLeaveHours(row.chargeMinutes)}`,
					{
						id: "when",
						header: "When",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				timeOffHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => {
						const status = getValue();
						return (
							<Badge
								className="uppercase"
								variant={
									status === "declined"
										? "destructive"
										: status === "approved"
											? "default"
											: "secondary"
								}
							>
								{status}
							</Badge>
						);
					},
				}),
				timeOffHelper.accessor(
					(row) =>
						[
							leaveTypes.data?.leaveTypes.find(
								(type) => type.id === row.leaveTypeId,
							)?.name,
							row.reason,
							row.decisionReason,
						]
							.filter(Boolean)
							.join(" · "),
					{
						id: "details",
						header: "Details",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground">{getValue() || "—"}</span>
						),
					},
				),
				timeOffHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) =>
						row.original.status === "pending" ? (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => setEditing(row.original)}
								>
									Edit
								</Button>
								<ConfirmAction
									trigger="Cancel request"
									triggerVariant="ghost"
									title="Cancel this time-off request?"
									description="Your manager will no longer review this request. You can submit a new one later."
									confirmLabel="Cancel request"
									destructive
									disabled={cancelTimeOff.isPending}
									onConfirm={() => cancelTimeOff.mutate(row.original.id)}
								/>
							</div>
						) : null,
				}),
			]),
		[cancelTimeOff, formatLeaveRange, leaveTypes.data?.leaveTypes],
	);

	function addRecurring() {
		if (recurringStart >= recurringEnd) {
			toast.error("Choose a valid time range.");
			return;
		}
		setRecurring([
			...recurring,
			{
				id: windowId(),
				weekday,
				startMinute: recurringStart,
				endMinute: recurringEnd,
			},
		]);
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
		setDates([
			...dates,
			{
				id: windowId(),
				date,
				startMinute: dateStart,
				endMinute: dateEnd,
			},
		]);
		setDate("");
	}

	const remainingForType = pto.data?.balances.find(
		(balance) => balance.leaveTypeId === leaveTypeId,
	)?.minutes;

	return (
		<AppDocument>
			<PageHeader
				title="Time off & availability"
				description="Request days off first. Recurring unavailability and preferences stay separate."
			/>

			{constraints.isLoading ? (
				<Skeleton className="h-40" />
			) : (
				<Tabs defaultValue="time-off">
					<TabsList variant="line">
						<TabsTrigger value="time-off">Time off</TabsTrigger>
						<TabsTrigger value="unavailable">When I can't work</TabsTrigger>
						<TabsTrigger value="preferences">Preferences</TabsTrigger>
					</TabsList>

					<TabsContent value="time-off" className="pt-4">
						<Card>
							<CardHeader>
								<CardTitle>Request time off</CardTitle>
								<CardDescription>
									{canRequestTimeOff
										? "All-day by default. Your manager reviews every request before it blocks the schedule."
										: "This Workplace is not accepting Time-off Requests from workers. Ask a manager to record time off."}
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								{(pto.data?.balances.length ?? 0) > 0 ? (
									<div className="flex flex-wrap gap-2">
										{pto.data?.balances.map((balance) => (
											<Badge key={balance.leaveTypeId} variant="outline">
												{balance.name}: {formatLeaveHours(balance.minutes)}
											</Badge>
										))}
									</div>
								) : null}
								<DataTable
									bounded
									fill={false}
									columns={timeOffColumns}
									data={constraints.data?.timeOff ?? []}
									getRowId={(row) => row.id}
									empty={
										<p className="text-muted-foreground text-sm">
											No time-off requests yet.
										</p>
									}
								/>
								{canRequestTimeOff ? (
									<LeaveWindowFields
										idPrefix="off"
										leaveTypes={leaveTypes.data?.leaveTypes ?? []}
										leaveTypeId={leaveTypeId}
										onLeaveTypeIdChange={setLeaveTypeId}
										startDate={offStartDate}
										endDate={offEndDate}
										onStartDateChange={setOffStartDate}
										onEndDateChange={setOffEndDate}
										allDay={offAllDay}
										onAllDayChange={setOffAllDay}
										startMinute={offStart}
										endMinute={offEnd}
										onStartMinuteChange={setOffStart}
										onEndMinuteChange={setOffEnd}
										reason={offReason}
										onReasonChange={setOffReason}
										remainingMinutes={remainingForType}
									/>
								) : null}
							</CardContent>
							{canRequestTimeOff ? (
								<CardFooter>
									<Button
										disabled={
											requestTimeOff.isPending || !offStartDate || !leaveTypeId
										}
										onClick={() => requestTimeOff.mutate()}
									>
										{requestTimeOff.isPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										Request time off
									</Button>
								</CardFooter>
							) : null}
						</Card>
					</TabsContent>

					<TabsContent value="unavailable" className="pt-4">
						<Card>
							<CardHeader>
								<CardTitle>When you can't work</CardTitle>
								<CardDescription>
									A hard constraint. Your manager should not schedule you during
									these times unless they record an override.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								<DataTable
									bounded
									fill={false}
									columns={unavailabilityColumns}
									data={unavailabilityRows}
									getRowId={(row) => `${row.kind}-${row.id}`}
									empty={
										<p className="text-muted-foreground text-sm">
											No unavailability added.
										</p>
									}
								/>
								<FieldGroup className="grid gap-3 sm:grid-cols-4">
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
									<Button
										type="button"
										variant="outline"
										onClick={addRecurring}
									>
										Add weekly window
									</Button>
								</FieldGroup>
								<FieldGroup className="grid gap-3 sm:grid-cols-4">
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
									<Button type="button" variant="outline" onClick={addDate}>
										Add date exception
									</Button>
								</FieldGroup>
							</CardContent>
							<CardFooter>
								<Button
									disabled={saveUnavailability.isPending}
									onClick={() => saveUnavailability.mutate()}
								>
									{saveUnavailability.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Save unavailability
								</Button>
							</CardFooter>
						</Card>
					</TabsContent>

					<TabsContent value="preferences" className="pt-4">
						<Card>
							<CardHeader>
								<CardTitle>Preferences</CardTitle>
								<CardDescription>
									A note for your manager. Preferences never block scheduling.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Field>
									<FieldLabel htmlFor="preference">What you prefer</FieldLabel>
									<Textarea
										id="preference"
										value={preference}
										onChange={(event) => setPreference(event.target.value)}
										placeholder="I prefer mornings and Sundays."
									/>
								</Field>
							</CardContent>
							<CardFooter>
								<Button
									disabled={savePreference.isPending}
									onClick={() => savePreference.mutate()}
								>
									{savePreference.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Save preference
								</Button>
							</CardFooter>
						</Card>
					</TabsContent>
				</Tabs>
			)}
			{editing ? (
				<WorkerEditLeaveSheet
					key={editing.id}
					request={editing}
					workplaceId={workplace?.id}
					leaveTypes={leaveTypes.data?.leaveTypes ?? []}
					balances={pto.data?.balances ?? []}
					onOpenChange={(open) => {
						if (!open) setEditing(null);
					}}
					onSaved={() => {
						setEditing(null);
						invalidate();
					}}
				/>
			) : null}
		</AppDocument>
	);
}

function WorkerEditLeaveSheet({
	request,
	workplaceId,
	leaveTypes,
	balances,
	onOpenChange,
	onSaved,
}: {
	request: WorkerConstraints["timeOff"][number];
	workplaceId: string | undefined;
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: { leaveTypeId: string; minutes: number }[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [leaveTypeId, setLeaveTypeId] = useState(request.leaveTypeId ?? "");
	const [startDate, setStartDate] = useState(request.startDate);
	const [endDate, setEndDate] = useState(request.endDate);
	const [allDay, setAllDay] = useState(request.allDay);
	const [startMinute, setStartMinute] = useState(request.startMinute ?? 9 * 60);
	const [endMinute, setEndMinute] = useState(request.endMinute ?? 17 * 60);
	const [reason, setReason] = useState(request.reason ?? "");
	const remainingMinutes = balances.find(
		(balance) => balance.leaveTypeId === leaveTypeId,
	)?.minutes;
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
	});
	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/time-off/${request.id}`, {
				method: "PATCH",
				body: {
					leaveTypeId,
					startDate,
					endDate,
					allDay,
					...(allDay ? {} : { startMinute, endMinute }),
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			onSaved();
			toast.success("Request updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Edit request</SheetTitle>
					<SheetDescription>
						Pending until your manager reviews it.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<LeaveWindowFields
						idPrefix="edit-off"
						leaveTypes={leaveTypes}
						leaveTypeId={leaveTypeId}
						onLeaveTypeIdChange={setLeaveTypeId}
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
						allDay={allDay}
						onAllDayChange={setAllDay}
						startMinute={startMinute}
						endMinute={endMinute}
						onStartMinuteChange={setStartMinute}
						onEndMinuteChange={setEndMinute}
						reason={reason}
						onReasonChange={setReason}
						remainingMinutes={remainingMinutes}
					/>
				</div>
				<SheetFooter>
					<Button
						disabled={save.isPending || !leaveTypeId || charge <= 0}
						onClick={() => save.mutate()}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save changes
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
