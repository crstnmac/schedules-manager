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
	FieldDescription,
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
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DatePicker } from "@/components/date-picker";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TimePicker } from "@/components/time-picker";
import { AppDocument } from "@/components/app-page";
import { api } from "@/lib/api";
import {
	useLeaveTypes,
	useMe,
	useMyConstraints,
	usePtoBalances,
	type WorkerConstraints,
} from "@/lib/queries";
import { formatDay, formatMinute, WEEKDAY_NAMES } from "@/lib/time";
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
const timeOffHelper = createDataColumnHelper<
	WorkerConstraints["timeOff"][number]
>();

function windowId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function AvailabilityPage() {
	const { workplace } = useWorkplace();
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
	const [offDate, setOffDate] = useState("");
	const [offStart, setOffStart] = useState(17 * 60);
	const [offEnd, setOffEnd] = useState(23 * 60);
	const [offReason, setOffReason] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");

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
			if (offStart === offEnd) {
				throw new Error("Choose a valid time range.");
			}
			const startsAt = new Date(`${offDate}T00:00:00`);
			startsAt.setMinutes(offStart);
			const endsAt = new Date(`${offDate}T00:00:00`);
			endsAt.setMinutes(offEnd);
			return api(`/v1/workplaces/${workplace?.id}/my/time-off`, {
				method: "POST",
				body: {
					startsAt: startsAt.toISOString(),
					endsAt: endsAt.toISOString(),
					reason: offReason.trim() || undefined,
					leaveTypeId,
				},
			});
		},
		onSuccess: () => {
			setOffDate("");
			setOffReason("");
			invalidate();
			toast.success("Time-off requested. Your manager will review it.");
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
		[dates, recurring],
	);
	const unavailabilityColumns = useMemo(
		() =>
			unavailabilityHelper.columns([
				unavailabilityHelper.accessor("kind", {
					header: "Kind",
					cell: ({ getValue }) =>
						getValue() === "weekly" ? "Weekly" : "Date",
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
					(row) => `${formatDay(row.startsAt)} → ${formatDay(row.endsAt)}`,
					{
						id: "period",
						header: "Period",
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
							<div className="flex justify-end">
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
		[cancelTimeOff, leaveTypes.data?.leaveTypes],
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

	return (
		<AppDocument>
			<PageHeader
				title="Availability"
				description="Three separate actions: when you cannot work, optional preferences, and time-off requests."
			/>

			{constraints.isLoading ? (
				<Skeleton className="h-40" />
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>When you can't work</CardTitle>
							<CardDescription>
								A hard constraint. Your manager should not schedule you during
								these times unless they record an override.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							{(pto.data?.balances.length ?? 0) > 0 ? (
								<div className="flex flex-wrap gap-2">
									{pto.data?.balances.map((balance) => (
										<Badge key={balance.leaveTypeId} variant="outline">
											{balance.name}: {(balance.minutes / 60).toFixed(1)}h
										</Badge>
									))}
								</div>
							) : null}
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
								<Button type="button" variant="outline" onClick={addRecurring}>
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

					<Card>
						<CardHeader>
							<CardTitle>Time-off requests</CardTitle>
							<CardDescription>
								You can see the status of every request. Pending requests can be
								cancelled.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
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
							<FieldGroup className="grid gap-3 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="off-leave-type">Leave Type</FieldLabel>
									<Select
										items={(leaveTypes.data?.leaveTypes ?? []).map((type) => ({
											label: type.name,
											value: type.id,
										}))}
										value={leaveTypeId}
										onValueChange={(value) => value && setLeaveTypeId(value)}
									>
										<SelectTrigger id="off-leave-type" className="w-full">
											<SelectValue placeholder="Choose a Leave Type" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{(leaveTypes.data?.leaveTypes ?? []).map((type) => (
													<SelectItem key={type.id} value={type.id}>
														{type.name}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="off-date">Date</FieldLabel>
									<DatePicker
										id="off-date"
										value={offDate}
										onValueChange={setOffDate}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="off-reason">
										Reason (optional)
									</FieldLabel>
									<Input
										id="off-reason"
										value={offReason}
										onChange={(event) => setOffReason(event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="off-start">From</FieldLabel>
									<TimePicker
										id="off-start"
										value={offStart}
										onValueChange={setOffStart}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="off-end">Until</FieldLabel>
									<TimePicker
										id="off-end"
										value={offEnd}
										onValueChange={setOffEnd}
									/>
									<FieldDescription>
										Your manager reviews every request.
									</FieldDescription>
								</Field>
							</FieldGroup>
						</CardContent>
						<CardFooter>
							<Button
								disabled={requestTimeOff.isPending || !offDate || !leaveTypeId}
								onClick={() => requestTimeOff.mutate()}
							>
								{requestTimeOff.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Request time off
							</Button>
						</CardFooter>
					</Card>
				</>
			)}
		</AppDocument>
	);
}
