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
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import { useMyConstraints } from "@/lib/queries";
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

function windowId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function AvailabilityPage() {
	const { workplace } = useWorkplace();
	const constraints = useMyConstraints(workplace?.id);
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
		<section className="flex flex-col gap-6">
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
							{recurring.length === 0 && dates.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No unavailability added.
								</p>
							) : (
								<ItemGroup>
									{recurring.map((item) => (
										<Item key={item.id} variant="outline" role="listitem">
											<ItemContent>
												<ItemTitle>
													Every {WEEKDAY_NAMES[item.weekday]} ·{" "}
													{formatMinute(item.startMinute)}–
													{formatMinute(item.endMinute)}
												</ItemTitle>
											</ItemContent>
											<ItemActions>
												<Button
													size="sm"
													variant="ghost"
													onClick={() =>
														setRecurring(
															recurring.filter((other) => other.id !== item.id),
														)
													}
												>
													Remove
												</Button>
											</ItemActions>
										</Item>
									))}
									{dates.map((item) => (
										<Item key={item.id} variant="outline" role="listitem">
											<ItemContent>
												<ItemTitle>
													{formatDay(item.date)} ·{" "}
													{formatMinute(item.startMinute)}–
													{formatMinute(item.endMinute)}
												</ItemTitle>
											</ItemContent>
											<ItemActions>
												<Button
													size="sm"
													variant="ghost"
													onClick={() =>
														setDates(
															dates.filter((other) => other.id !== item.id),
														)
													}
												>
													Remove
												</Button>
											</ItemActions>
										</Item>
									))}
								</ItemGroup>
							)}
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
							{(constraints.data?.timeOff.length ?? 0) === 0 ? (
								<p className="text-muted-foreground text-sm">
									No time-off requests yet.
								</p>
							) : (
								<ItemGroup>
									{(constraints.data?.timeOff ?? []).map((request) => (
										<Item key={request.id} variant="outline" role="listitem">
											<ItemContent>
												<ItemTitle>
													{formatDay(request.startsAt)} →{" "}
													{formatDay(request.endsAt)}
													<Badge
														className="uppercase"
														variant={
															request.status === "declined"
																? "destructive"
																: request.status === "approved"
																	? "default"
																	: "secondary"
														}
													>
														{request.status}
													</Badge>
												</ItemTitle>
												<ItemDescription>
													{[request.reason, request.decisionReason]
														.filter(Boolean)
														.join(" · ")}
												</ItemDescription>
											</ItemContent>
											{request.status === "pending" ? (
												<ItemActions>
													<Button
														size="sm"
														variant="ghost"
														onClick={() => cancelTimeOff.mutate(request.id)}
													>
														Cancel
													</Button>
												</ItemActions>
											) : null}
										</Item>
									))}
								</ItemGroup>
							)}
							<FieldGroup className="grid gap-3 sm:grid-cols-2">
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
								disabled={requestTimeOff.isPending || !offDate}
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
		</section>
	);
}
