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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
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
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlarmClockIcon,
	BellRingIcon,
	ChevronRightIcon,
	CircleCheckIcon,
	CircleIcon,
	MapPinIcon,
	TagsIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
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
	useScheduleLabor,
	useWorkers,
	useWorkplaceSettings,
} from "@/lib/queries";
import { addDays, weekStartOf } from "@/lib/schedule-calendar";
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

function formatWeekLabel(weekStart: string): string {
	const start = new Date(`${weekStart}T12:00:00`);
	const end = new Date(`${addDays(weekStart, 6)}T12:00:00`);
	const fmt = (date: Date) =>
		date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return `${fmt(start)} – ${fmt(end)}`;
}

function formatHours(minutes: number): string {
	return `${(minutes / 60).toFixed(1)}h`;
}

function formatCurrency(cents: number): string {
	return (cents / 100).toLocaleString(undefined, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	});
}

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

const SECTION_ENTER =
	"animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none";

function WeekMetric({
	label,
	value,
	hint,
	tone = "default",
}: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	tone?: "default" | "amber" | "destructive";
}) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd
				className={cn(
					"font-heading font-semibold text-xl tabular-nums",
					tone === "amber" && "text-warning-foreground",
					tone === "destructive" && "text-destructive",
				)}
			>
				{value}
			</dd>
			{hint ? (
				<span className="text-muted-foreground text-xs tabular-nums">
					{hint}
				</span>
			) : null}
		</div>
	);
}

function StatLink({
	icon: Icon,
	value,
	label,
	to,
	delay,
}: {
	icon: typeof MapPinIcon;
	value: number;
	label: string;
	to:
		| "/dashboard/settings/locations"
		| "/dashboard/settings/positions"
		| "/dashboard/workers";
	delay: number;
}) {
	return (
		<Item
			variant="outline"
			size="sm"
			render={<Link to={to} />}
			className={cn(
				"transition-transform duration-150 ease-out active:scale-[0.99] motion-reduce:transform-none",
				SECTION_ENTER,
			)}
			style={{ animationDelay: `${delay}ms` }}
		>
			<ItemMedia variant="icon">
				<Icon />
			</ItemMedia>
			<ItemContent>
				<ItemTitle className="font-semibold text-base tabular-nums">
					{value}
				</ItemTitle>
				<ItemDescription>{label}</ItemDescription>
			</ItemContent>
		</Item>
	);
}

function Overview() {
	const { workplace } = useWorkplace();
	const { formatMinute, formatShiftRange } = useDisplayPrefs();
	const staffColumns = useMemo(
		() => createStaffColumns(formatMinute),
		[formatMinute],
	);
	const settings = useWorkplaceSettings(workplace?.id);
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const workers = useWorkers(workplace?.id);
	const pilot = usePilotStatus(workplace?.id);
	const [focusLocationId, setFocusLocationId] = useState<string | null>(null);
	const focusLocation =
		locations.data?.find((location) => location.id === focusLocationId) ??
		locations.data?.[0];
	const weekStart = settings.data
		? weekStartOf(new Date(), settings.data.weekStartDay)
		: undefined;
	const currentSchedule = useSchedule(focusLocation?.id, weekStart);
	const scheduleLabor = useScheduleLabor(focusLocation?.id, weekStart);
	const acceptances = useAcceptances(currentSchedule.data?.schedule.id);
	const mySchedule = useMySchedule(workplace?.id, "home");
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
	const openShiftCount =
		scheduleData?.shifts.filter((shift) => shift.employmentId === null)
			.length ?? 0;
	const conflictCount =
		scheduleData?.shifts.reduce(
			(sum, shift) => sum + shift.conflicts.length,
			0,
		) ?? 0;
	const scheduledMinutes =
		scheduleData?.hours.reduce((sum, entry) => sum + entry.minutes, 0) ?? 0;
	const laborPercent = scheduleLabor.data?.laborPercent ?? null;
	const laborGoal = settings.data?.laborCostPercentGoal ?? null;
	const latestVersion = scheduleData?.publication.latestVersionNumber ?? null;
	const hasUnpublishedChanges =
		scheduleData?.publication.hasUnpublishedChanges ?? false;
	const unacknowledged = pilotCounts?.unacknowledgedDeliveries ?? 0;

	const scheduleStatus =
		latestVersion === null
			? { label: "Draft schedule", published: false }
			: hasUnpublishedChanges
				? { label: `Draft changes on v${latestVersion}`, published: false }
				: { label: `Published v${latestVersion}`, published: true };

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

	const hasAttentionItems =
		constrainedStaff.length > 0 ||
		outstandingAcceptances.length > 0 ||
		myPendingAcceptances.length > 0;

	return (
		<AppDocument widthClassName="max-w-5xl">
			{nextShift ? (
				<Card
					className={cn(
						SECTION_ENTER,
						onClock && "border-primary/40 bg-primary/5",
					)}
				>
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
							{onClock ? "Open clock" : "View shift & clock"}
						</Button>
					</CardHeader>
				</Card>
			) : null}

			<Card
				className={cn(SECTION_ENTER, "overflow-visible")}
				style={{ animationDelay: "0ms" }}
			>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>This week</CardTitle>
								<Badge
									variant={scheduleStatus.published ? "default" : "secondary"}
								>
									{scheduleStatus.published ? (
										<CircleCheckIcon data-icon="inline-start" />
									) : (
										<CircleIcon data-icon="inline-start" />
									)}
									{scheduleStatus.label}
								</Badge>
							</div>
							<CardDescription>
								{weekStart ? formatWeekLabel(weekStart) : "Loading week"}
								{focusLocation ? ` · ${focusLocation.name}` : ""}
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{(locations.data?.length ?? 0) > 1 ? (
								<Select
									items={(locations.data ?? []).map((location) => ({
										label: location.name,
										value: location.id,
									}))}
									value={focusLocation?.id ?? null}
									onValueChange={(value) => {
										if (value) setFocusLocationId(value);
									}}
								>
									<SelectTrigger
										aria-label="Week location"
										size="sm"
										className="w-36"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{(locations.data ?? []).map((location) => (
												<SelectItem key={location.id} value={location.id}>
													{location.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							) : null}
							<Button
								variant="outline"
								size="sm"
								nativeButton={false}
								render={<Link to="/dashboard/schedule" />}
							>
								Open schedule
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{isLoading || currentSchedule.isLoading ? (
						<dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
							{["hours", "labor", "open", "conflicts"].map((key) => (
								<Skeleton key={key} className="h-14" />
							))}
						</dl>
					) : (
						<dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
							<WeekMetric
								label="Scheduled"
								value={formatHours(scheduledMinutes)}
								hint={
									scheduleLabor.data
										? formatCurrency(scheduleLabor.data.scheduledCents)
										: undefined
								}
							/>
							<WeekMetric
								label="Labor %"
								value={
									laborPercent == null ? "—" : `${laborPercent.toFixed(1)}%`
								}
								hint={laborGoal == null ? undefined : `Goal ${laborGoal}%`}
							/>
							<WeekMetric
								label="Open shifts"
								value={openShiftCount}
								tone={openShiftCount > 0 ? "amber" : "default"}
								hint={openShiftCount > 0 ? "Need a worker" : "All covered"}
							/>
							<WeekMetric
								label="Conflicts"
								value={conflictCount}
								tone={conflictCount > 0 ? "destructive" : "default"}
								hint={conflictCount > 0 ? "Resolve before publishing" : "None"}
							/>
						</dl>
					)}
					{unacknowledged > 0 ? (
						<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
							<p className="flex items-center gap-2 text-muted-foreground text-xs">
								<BellRingIcon className="size-4" />
								<span className="tabular-nums">
									{unacknowledged} schedule change
									{unacknowledged === 1 ? "" : "s"} still need acknowledgement
								</span>
							</p>
							<Button
								variant="ghost"
								size="sm"
								disabled={remind.isPending}
								onClick={() => remind.mutate()}
							>
								{remind.isPending ? "Sending…" : "Remind workers"}
							</Button>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card className={SECTION_ENTER} style={{ animationDelay: "60ms" }}>
				<CardHeader>
					<CardTitle>Needs attention</CardTitle>
					<CardDescription>
						Current-week constraints and unresolved shift decisions
						{focusLocation ? ` for ${focusLocation.name}` : ""}.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-6">
					{!hasAttentionItems ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<CircleCheckIcon />
								</EmptyMedia>
								<EmptyTitle>You're all caught up</EmptyTitle>
								<EmptyDescription>
									No worker constraints or pending shift decisions for this
									week.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}
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

			{completedSteps < checklist.length ? (
				<Card className={SECTION_ENTER} style={{ animationDelay: "120ms" }}>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle>Set up scheduling</CardTitle>
							<Badge variant="secondary">
								{completedSteps} of {checklist.length} complete
							</Badge>
						</div>
						<CardDescription>
							Finish these steps to get your workplace ready.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col">
							{checklist.map((step) => (
								<li key={step.label}>
									<Button
										variant="ghost"
										className={cn(
											"h-auto w-full justify-start py-2.5 transition-colors duration-150",
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

			<Card className={SECTION_ENTER} style={{ animationDelay: "180ms" }}>
				<CardHeader>
					<CardTitle>Workplace</CardTitle>
					<CardDescription>Team and settings at a glance.</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
							{["locations", "positions", "workers", "invitations"].map(
								(key) => (
									<Skeleton key={key} className="h-16" />
								),
							)}
						</div>
					) : (
						<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
							<StatLink
								icon={MapPinIcon}
								value={locations.data?.length ?? 0}
								label="Locations"
								to="/dashboard/settings/locations"
								delay={0}
							/>
							<StatLink
								icon={TagsIcon}
								value={positions.data?.length ?? 0}
								label="Positions"
								to="/dashboard/settings/positions"
								delay={40}
							/>
							<StatLink
								icon={UsersIcon}
								value={activeWorkers.length}
								label="Active workers"
								to="/dashboard/workers"
								delay={80}
							/>
							<StatLink
								icon={UserPlusIcon}
								value={pendingInvitations.length}
								label="Pending invitations"
								to="/dashboard/workers"
								delay={120}
							/>
						</div>
					)}
					{pendingInvitations.length > 0 ? (
						<Link
							to="/dashboard/workers"
							className="mt-3 inline-flex items-center gap-1 text-primary text-xs transition-colors duration-150 hover:underline"
						>
							Review pending invitations
							<ChevronRightIcon className="size-3.5" />
						</Link>
					) : null}
				</CardContent>
			</Card>
		</AppDocument>
	);
}
