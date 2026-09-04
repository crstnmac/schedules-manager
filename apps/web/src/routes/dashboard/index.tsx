import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlarmClockIcon,
	CalendarCheckIcon,
	CircleCheckIcon,
	CircleIcon,
	MapPinIcon,
	TagsIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import {
	type AcceptancesResponse,
	type ScheduleResponse,
	useAcceptances,
	useLocations,
	useMySchedule,
	usePilotStatus,
	usePositions,
	useRespondToAcceptance,
	useSchedule,
	useWorkers,
} from "@/lib/queries";
import { formatDay, WEEKDAY_NAMES } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

type StaffRow = ScheduleResponse["staff"][number];
type AcceptanceRow = AcceptancesResponse["acceptances"][number];
type MyAcceptanceRow = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["pendingAcceptances"]
>[number];
const staffHelper = createDataColumnHelper<StaffRow>();
const acceptanceHelper = createDataColumnHelper<AcceptanceRow>();
const myAcceptanceHelper = createDataColumnHelper<MyAcceptanceRow>();

function staffConstraintText(
	member: StaffRow,
	formatMinute: (minute: number) => string,
): string {
	const parts: string[] = [];
	if ((member.unavailability?.length ?? 0) > 0) {
		parts.push(
			(member.unavailability ?? [])
				.map((window) =>
					window.kind === "recurring"
						? `Can't work ${WEEKDAY_NAMES[window.weekday ?? 0]} ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`
						: `Can't work ${window.date} ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`,
				)
				.join(" · "),
		);
	}
	if (member.preference) {
		parts.push(`Prefers: ${member.preference}`);
	}
	if ((member.timeOff?.length ?? 0) > 0) {
		parts.push(
			`${member.timeOff?.length} time-off request${member.timeOff?.length === 1 ? "" : "s"}`,
		);
	}
	return parts.join(" · ");
}

function createStaffColumns(formatMinute: (minute: number) => string) {
	return staffHelper.columns([
		staffHelper.accessor("name", {
			header: "Worker",
			cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
		}),
		staffHelper.accessor((row) => staffConstraintText(row, formatMinute), {
			id: "details",
			header: "Constraints",
		}),
	]);
}
const overviewAcceptanceColumns = acceptanceHelper.columns([
	acceptanceHelper.accessor(
		(row) => `${row.workerName} · v${row.versionNumber}`,
		{
			id: "worker",
			header: "Worker",
			cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
		},
	),
	acceptanceHelper.accessor("changeSummary", { header: "Change" }),
	acceptanceHelper.accessor("status", {
		header: "Status",
		cell: ({ getValue }) => {
			const status = getValue();
			return (
				<Badge
					variant={
						status === "declined"
							? "destructive"
							: status === "accepted"
								? "default"
								: "secondary"
					}
				>
					{status}
				</Badge>
			);
		},
	}),
]);

function currentWeekStart(): string {
	const date = new Date();
	const day = date.getDay();
	date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
	return date.toLocaleDateString("sv-SE");
}

function Overview() {
	const { workplace } = useWorkplace();
	const { formatMinute, formatShiftRange } = useDisplayPrefs();
	const staffColumns = useMemo(
		() => createStaffColumns(formatMinute),
		[formatMinute],
	);
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const workers = useWorkers(workplace?.id);
	const pilot = usePilotStatus(workplace?.id);
	const currentSchedule = useSchedule(
		locations.data?.[0]?.id,
		currentWeekStart(),
	);
	const acceptances = useAcceptances(currentSchedule.data?.schedule.id);
	const mySchedule = useMySchedule(workplace?.id);
	const respond = useRespondToAcceptance();
	const nextShift = mySchedule.data?.nextShift ?? null;
	const onClock =
		nextShift?.timeEntry != null && nextShift.timeEntry.clockedOutAt === null;
	const queryClient = useQueryClient();
	const remind = useMutation({
		mutationFn: () =>
			api<{ reminded: number }>(
				`/v1/workplaces/${workplace?.id}/reminders/unacknowledged`,
				{ method: "POST" },
			),
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: ["pilot-status", workplace?.id],
			});
			toast.success(
				result.reminded > 0
					? `Reminded ${result.reminded} worker${result.reminded === 1 ? "" : "s"}.`
					: "Everyone is already caught up.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const isLoading =
		locations.isLoading || positions.isLoading || workers.isLoading;

	const activeWorkers =
		workers.data?.workers.filter(
			(worker) => worker.status === "active" && worker.kind === "worker",
		) ?? [];
	const pendingInvitations =
		workers.data?.invitations.filter(
			(invitation) =>
				invitation.status === "pending" &&
				new Date(invitation.expiresAt).getTime() > Date.now(),
		) ?? [];

	const stats = [
		{
			label: "Locations",
			value: locations.data?.length ?? 0,
			to: "/dashboard/settings/locations" as const,
			icon: MapPinIcon,
		},
		{
			label: "Positions",
			value: positions.data?.length ?? 0,
			to: "/dashboard/settings/positions" as const,
			icon: TagsIcon,
		},
		{
			label: "Active workers",
			value: activeWorkers.length,
			to: "/dashboard/workers" as const,
			icon: UsersIcon,
		},
		{
			label: "Pending invitations",
			value: pendingInvitations.length,
			to: "/dashboard/workers" as const,
			icon: UserPlusIcon,
		},
	];
	const pilotCounts = pilot.data?.counts;
	const checklist = [
		{
			label: "Add your first location",
			done: (pilotCounts?.locations ?? 0) > 0,
			to: "/dashboard/settings/locations" as const,
		},
		{
			label: "Add positions",
			done: (pilotCounts?.positions ?? 0) > 0,
			to: "/dashboard/settings/positions" as const,
		},
		{
			label: "Import or invite your team",
			done:
				(pilotCounts?.activeWorkers ?? 0) +
					(pilotCounts?.pendingInvitations ?? 0) >
				0,
			to: "/dashboard/workers" as const,
		},
		{
			label: "Build the first week",
			done: (pilotCounts?.draftShifts ?? 0) > 0,
			to: "/dashboard/schedule" as const,
		},
		{
			label: "Publish the first schedule",
			done: (pilotCounts?.publishedVersions ?? 0) > 0,
			to: "/dashboard/schedule" as const,
		},
	];
	const completedSteps = checklist.filter((step) => step.done).length;
	const scheduleData = currentSchedule.data;
	const constrainedStaff = (scheduleData?.staff ?? []).filter(
		(member) =>
			(member.unavailability?.length ?? 0) > 0 ||
			member.preference ||
			(member.timeOff?.length ?? 0) > 0,
	);
	const outstandingAcceptances = (acceptances.data?.acceptances ?? []).filter(
		(acceptance) => acceptance.status !== "accepted",
	);
	const myPendingAcceptances = mySchedule.data?.pendingAcceptances ?? [];
	const myAcceptanceColumns = useMemo(
		() =>
			myAcceptanceHelper.columns([
				myAcceptanceHelper.accessor(
					(row) => `${formatDay(row.date)} · ${formatMinute(row.startMinute)}`,
					{
						id: "when",
						header: "When",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				myAcceptanceHelper.accessor("positionName", { header: "Position" }),
				myAcceptanceHelper.accessor("changeSummary", { header: "Change" }),
				myAcceptanceHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								disabled={respond.isPending}
								onClick={() =>
									respond.mutate(
										{ acceptanceId: row.original.id, decision: "accept" },
										{
											onSuccess: () => {
												queryClient.invalidateQueries({
													queryKey: ["acceptances"],
												});
												toast.success("Shift accepted.");
											},
											onError: (error) => toast.error((error as Error).message),
										},
									)
								}
							>
								{respond.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Accept shift
							</Button>
							<ConfirmAction
								trigger="Decline"
								disabled={respond.isPending}
								title="Decline this shift change?"
								description="Your response is recorded and visible to workplace managers."
								confirmLabel="Decline shift"
								destructive
								onConfirm={() =>
									respond.mutate(
										{ acceptanceId: row.original.id, decision: "decline" },
										{
											onSuccess: () =>
												queryClient.invalidateQueries({
													queryKey: ["acceptances"],
												}),
											onError: (error) => toast.error((error as Error).message),
										},
									)
								}
							/>
						</div>
					),
				}),
			]),
		[respond, formatMinute, queryClient],
	);
	const hasScheduleDetails =
		constrainedStaff.length > 0 ||
		outstandingAcceptances.length > 0 ||
		myPendingAcceptances.length > 0;

	return (
		<AppDocument widthClassName="max-w-5xl">
			{nextShift ? (
				<Card className={cn(onClock && "border-primary/40 bg-primary/5")}>
					<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
						<div className="flex min-w-0 items-start gap-3">
							<div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
								<AlarmClockIcon className="size-4" />
							</div>
							<div className="min-w-0">
								<CardTitle className="text-base">
									{onClock ? "You're on the clock" : "Your next shift"}
								</CardTitle>
								<CardDescription>
									{formatDay(nextShift.startsAt)} ·{" "}
									{formatShiftRange(
										nextShift.startMinute,
										nextShift.endMinute,
										nextShift.overnight,
									)}{" "}
									· {nextShift.positionName}
								</CardDescription>
							</div>
						</div>
						<Button
							size="sm"
							nativeButton={false}
							render={<Link to="/dashboard/clock" />}
						>
							{onClock ? "Open clock" : "Clock in"}
						</Button>
					</CardHeader>
				</Card>
			) : null}
			{isLoading ? (
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{["locations", "positions", "workers", "invitations"].map((key) => (
						<Skeleton key={key} className="h-20" />
					))}
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{stats.map((stat) => (
						<Item
							key={stat.label}
							variant="outline"
							size="sm"
							render={<Link to={stat.to} />}
						>
							<ItemMedia variant="icon">
								<stat.icon />
							</ItemMedia>
							<ItemContent>
								<ItemTitle className="font-semibold text-lg tabular-nums">
									{stat.value}
								</ItemTitle>
								<ItemDescription>{stat.label}</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</div>
			)}
			{completedSteps < checklist.length ? (
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle>Setup</CardTitle>
							<Badge variant="secondary">
								{completedSteps} of {checklist.length} complete
							</Badge>
						</div>
						<CardDescription>
							Finish these steps to get scheduling ready.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col">
							{checklist.map((step) => (
								<li key={step.label}>
									<Button
										variant="ghost"
										className={cn(
											"h-auto w-full justify-start py-2.5",
											step.done && "text-muted-foreground",
										)}
										nativeButton={false}
										render={<Link to={step.to} />}
									>
										{step.done ? (
											<CircleCheckIcon className="text-primary" />
										) : (
											<CircleIcon />
										)}
										<span className={cn(step.done && "line-through")}>
											{step.label}
										</span>
										<span className="sr-only">
											{step.done ? "Completed" : "Not completed"}
										</span>
									</Button>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}
			{hasScheduleDetails ? (
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle>Needs attention</CardTitle>
								<CardDescription>
									Current-week constraints and unresolved shift decisions for{" "}
									{locations.data?.[0]?.name}.
								</CardDescription>
							</div>
							<Button
								variant="outline"
								size="sm"
								nativeButton={false}
								render={<Link to="/dashboard/schedule" />}
							>
								Open calendar
							</Button>
						</div>
					</CardHeader>
					<CardContent className="grid gap-4">
						{constrainedStaff.length > 0 ? (
							<section aria-labelledby="overview-constraints-heading">
								<div className="mb-3 flex items-center gap-2">
									<h3
										id="overview-constraints-heading"
										className="font-semibold text-sm"
									>
										Constraints
									</h3>
									<Badge variant="secondary">{constrainedStaff.length}</Badge>
								</div>
								<DataTable
									fill={false}
									bounded
									columns={staffColumns}
									data={constrainedStaff.slice(0, 6)}
									getRowId={(row) => row.employmentId}
								/>
							</section>
						) : null}
						{myPendingAcceptances.length > 0 ? (
							<section aria-labelledby="overview-my-acceptances-heading">
								<div className="mb-1 flex items-center gap-2">
									<h3
										id="overview-my-acceptances-heading"
										className="font-semibold text-sm"
									>
										Your shifts need acceptance
									</h3>
									<Badge
										variant="secondary"
										className="h-5 rounded-md px-1.5 tabular-nums"
									>
										{myPendingAcceptances.length}
									</Badge>
								</div>
								<p className="mb-3 text-muted-foreground text-xs">
									A late material change touched your own shifts. Accept or
									decline each one.
								</p>
								<DataTable
									fill={false}
									bounded
									columns={myAcceptanceColumns}
									data={myPendingAcceptances}
									getRowId={(row) => row.id}
								/>
							</section>
						) : null}
						{outstandingAcceptances.length > 0 ? (
							<section aria-labelledby="overview-acceptances-heading">
								<h3
									id="overview-acceptances-heading"
									className="mb-3 font-semibold text-sm"
								>
									Shift acceptances
								</h3>
								<DataTable
									fill={false}
									bounded
									columns={overviewAcceptanceColumns}
									data={outstandingAcceptances.slice(0, 6)}
									getRowId={(row) => row.id}
								/>
							</section>
						) : null}
					</CardContent>
				</Card>
			) : null}
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle className="flex items-center gap-2">
								<CalendarCheckIcon /> Pilot operations
							</CardTitle>
							<CardDescription>
								Use this as the daily health check while the team is piloting.
							</CardDescription>
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={
								remind.isPending ||
								(pilotCounts?.unacknowledgedDeliveries ?? 0) === 0
							}
							onClick={() => remind.mutate()}
						>
							Send reminder
						</Button>
					</div>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-x-8 gap-y-3">
					<div className="flex items-baseline gap-2">
						<p className="font-semibold text-lg tabular-nums">
							{pilotCounts?.publishedVersions ?? 0}
						</p>
						<p className="text-muted-foreground text-xs">Published versions</p>
					</div>
					<div className="flex items-baseline gap-2">
						<p className="font-semibold text-lg tabular-nums">
							{pilotCounts?.unacknowledgedDeliveries ?? 0}
						</p>
						<p className="text-muted-foreground text-xs">
							Need acknowledgement
						</p>
					</div>
					<div className="flex items-baseline gap-2">
						<p className="font-semibold text-lg tabular-nums">
							{pilot.data?.feedback.length ?? 0}
						</p>
						<p className="text-muted-foreground text-xs">
							Recent feedback items
						</p>
					</div>
				</CardContent>
			</Card>
		</AppDocument>
	);
}
