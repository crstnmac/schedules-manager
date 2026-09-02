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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CalendarCheckIcon,
	CircleIcon,
	MapPinIcon,
	TagsIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
	useAcceptances,
	useLocations,
	usePilotStatus,
	usePositions,
	useSchedule,
	useWorkers,
	type AcceptancesResponse,
	type ScheduleResponse,
} from "@/lib/queries";
import { formatMinute, WEEKDAY_NAMES } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";
import { AppDocument } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

type StaffRow = ScheduleResponse["staff"][number];
type AcceptanceRow = AcceptancesResponse["acceptances"][number];
const staffHelper = createDataColumnHelper<StaffRow>();
const acceptanceHelper = createDataColumnHelper<AcceptanceRow>();

function staffConstraintText(member: StaffRow): string {
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

const staffColumns = staffHelper.columns([
	staffHelper.accessor("name", {
		header: "Worker",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	staffHelper.accessor((row) => staffConstraintText(row), {
		id: "details",
		header: "Constraints",
	}),
]);
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
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const workers = useWorkers(workplace?.id);
	const pilot = usePilotStatus(workplace?.id);
	const currentSchedule = useSchedule(
		locations.data?.[0]?.id,
		currentWeekStart(),
	);
	const acceptances = useAcceptances(currentSchedule.data?.schedule.id);
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
	const hasScheduleDetails =
		constrainedStaff.length > 0 || outstandingAcceptances.length > 0;

	return (
		<AppDocument widthClassName="max-w-5xl">
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
							<CardTitle>Next setup step</CardTitle>
							<Badge
								variant={
									completedSteps === checklist.length ? "default" : "secondary"
								}
							>
								{completedSteps} of {checklist.length} complete
							</Badge>
						</div>
						<CardDescription>
							Complete the next step to get scheduling ready.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{checklist
							.filter((step) => !step.done)
							.slice(0, 1)
							.map((step) => (
								<Button
									key={step.label}
									variant="ghost"
									className="h-auto justify-start py-3"
									nativeButton={false}
									render={<Link to={step.to} />}
								>
									<CircleIcon />
									<span>{step.label}</span>
								</Button>
							))}
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
