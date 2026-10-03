import { env } from "@SchedulesManager/env/web";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@SchedulesManager/ui/components/chart";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@SchedulesManager/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { AttendanceReportView } from "@/components/attendance-report";
import { DatePicker } from "@/components/date-picker";
import {
	ReportMetricGrid,
	ReportSectionHeader,
} from "@/components/report-layout";
import { api } from "@/lib/api";
import { formatLeaveHours } from "@/lib/leave";
import { hasCapability } from "@/lib/privileges";
import {
	type RequestType,
	useCoverageReport,
	useReportSummary,
	useRequestAnalytics,
} from "@/lib/queries";
import { shiftDays, workplaceTodayKey } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/reports")({
	component: ReportsPage,
});

const CHART_COLORS = [
	"var(--chart-2)",
	"var(--chart-4)",
	"var(--chart-3)",
	"var(--chart-1)",
	"var(--chart-5)",
] as const;

function formatHours(minutes: number) {
	return `${(minutes / 60).toFixed(1)}h`;
}

function formatCurrency(cents: number) {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	});
}

function formatPercent(value: number | null) {
	return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatRatio(value: number) {
	return `${Math.round(value * 100)}%`;
}

const REQUEST_LABELS: Record<RequestType, string> = {
	time_off: "Time off",
	shift_release: "Shift release",
	shift_pickup: "Shift pickup",
	shift_swap: "Shift swap",
};

function shortDate(key: string) {
	return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

interface LeaveReportRow {
	employmentId: string;
	employmentName: string | null;
	employmentEmail: string;
	leaveTypeName: string;
	leaveTypePaid: boolean;
	approvedMinutes: number;
	unpaidMinutes: number;
	overdrawnMinutes: number;
	encashmentMinutes: number;
	encashmentCents: number;
	encashmentStatus: string | null;
}

interface LeaveReportResponse {
	from: string;
	to: string;
	rows: LeaveReportRow[];
	totals: {
		approvedMinutes: number;
		unpaidMinutes: number;
		overdrawnMinutes: number;
		encashmentMinutes: number;
		encashmentCents: number;
	};
}

const hoursConfig = {
	hours: { label: "Hours", color: "var(--chart-2)" },
} satisfies ChartConfig;
const costConfig = {
	labor: { label: "Labor cost", color: "var(--chart-4)" },
	sales: { label: "Sales", color: "var(--chart-2)" },
} satisfies ChartConfig;
const percentConfig = {
	laborPercent: { label: "Labor %", color: "var(--chart-3)" },
} satisfies ChartConfig;
const workerConfig = {
	hours: { label: "Hours", color: "var(--chart-2)" },
} satisfies ChartConfig;
const coverageConfig = {
	fillRate: { label: "Fill rate", color: "var(--chart-2)" },
	utilization: { label: "Utilization", color: "var(--chart-4)" },
} satisfies ChartConfig;
const requestConfig = {
	approved: { label: "Approved", color: "var(--chart-2)" },
	declined: { label: "Declined", color: "var(--chart-4)" },
	pending: { label: "Pending", color: "var(--chart-3)" },
} satisfies ChartConfig;

function ReportsPage() {
	const { workplace, kind, privileges } = useWorkplace();
	const canViewReports = hasCapability(
		{ kind: kind ?? "viewer", privileges },
		"reports.view",
	);
	const [from, setFrom] = useState(() => shiftDays(workplaceTodayKey(), -14));
	const [to, setTo] = useState(() => workplaceTodayKey());
	const [isDownloading, setIsDownloading] = useState(false);
	const [isDownloadingLeave, setIsDownloadingLeave] = useState(false);
	const [isDownloadingPayroll, setIsDownloadingPayroll] = useState(false);
	const [tab, setTab] = useState<
		"attendance" | "hours" | "coverage" | "requests" | "leave"
	>("attendance");
	const invalidRange = !from || !to || from > to;

	const summary = useReportSummary(workplace?.id, from, to, !invalidRange);
	const coverage = useCoverageReport(workplace?.id, from, to, !invalidRange);
	const requests = useRequestAnalytics(workplace?.id, from, to, !invalidRange);
	const leave = useQuery({
		queryKey: ["report-leave", workplace?.id, from, to] as const,
		queryFn: () =>
			api<LeaveReportResponse>(
				`/v1/workplaces/${workplace?.id}/reports/leave?from=${from}&to=${to}`,
			),
		enabled:
			Boolean(workplace?.id) &&
			canViewReports &&
			tab === "leave" &&
			!invalidRange,
	});

	const days = useMemo(() => {
		return (summary.data?.byDate ?? []).map((day) => ({
			date: day.date,
			label: shortDate(day.date),
			hours: Number((day.workedMinutes / 60).toFixed(1)),
			labor: Number((day.laborCents / 100).toFixed(2)),
			sales: Number((day.salesCents / 100).toFixed(2)),
			laborPercent: day.laborPercent,
		}));
	}, [summary.data]);

	const positions = useMemo(() => {
		return (summary.data?.byPosition ?? []).map((position, index) => ({
			key: position.positionId,
			name: position.name,
			hours: Number((position.workedMinutes / 60).toFixed(1)),
			color: CHART_COLORS[index % CHART_COLORS.length],
		}));
	}, [summary.data]);

	const workers = useMemo(() => {
		return (summary.data?.byWorker ?? []).slice(0, 8).map((worker) => ({
			name: worker.name,
			hours: Number((worker.workedMinutes / 60).toFixed(1)),
		}));
	}, [summary.data]);

	const coverageDays = useMemo(() => {
		return (coverage.data?.byDate ?? []).map((day) => ({
			label: shortDate(day.date),
			fillRate: Number((day.fillRate * 100).toFixed(1)),
			utilization: Number((day.utilization * 100).toFixed(1)),
		}));
	}, [coverage.data]);
	const coverageTotals = coverage.data?.totals;
	const coverageLocations = coverage.data?.byLocation ?? [];

	const requestRows = useMemo(
		() => requests.data?.requests ?? [],
		[requests.data],
	);
	const requestChartData = useMemo(
		() =>
			requestRows.map((row) => ({
				label: REQUEST_LABELS[row.type],
				approved: row.approved,
				declined: row.declined,
				pending: row.pending,
			})),
		[requestRows],
	);

	const positionConfig = useMemo(
		() =>
			({
				hours: { label: "Hours" },
				...Object.fromEntries(
					positions.map((position) => [
						position.key,
						{ label: position.name, color: position.color },
					]),
				),
			}) satisfies ChartConfig,
		[positions],
	);

	const totals = summary.data?.totals;
	const hasData = (summary.data?.byDate.length ?? 0) > 0;

	async function download() {
		if (invalidRange || isDownloading || !workplace) return;
		setIsDownloading(true);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/workplaces/${workplace?.id}/reports/hours.csv?from=${from}&to=${to}`,
				{ credentials: "include" },
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(
					payload?.message ?? "Couldn’t download the report. Please try again.",
				);
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `hours-${from}-${to}.csv`;
			link.click();
			URL.revokeObjectURL(url);
			toast.success("Report downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Couldn’t download the report. Please try again.",
			);
		} finally {
			setIsDownloading(false);
		}
	}

	async function downloadLeavePayroll() {
		if (invalidRange || isDownloadingLeave || !workplace) return;
		setIsDownloadingLeave(true);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/workplaces/${workplace.id}/reports/leave-payroll.csv?from=${from}&to=${to}`,
				{ credentials: "include" },
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(
					payload?.message ?? "Couldn’t download the report. Please try again.",
				);
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `leave-payroll-${from}-${to}.csv`;
			link.click();
			URL.revokeObjectURL(url);
			toast.success("Leave payroll downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Couldn’t download the report. Please try again.",
			);
		} finally {
			setIsDownloadingLeave(false);
		}
	}

	async function downloadPayrollTime() {
		if (invalidRange || isDownloadingPayroll || !workplace) return;
		setIsDownloadingPayroll(true);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/workplaces/${workplace.id}/reports/payroll-time.csv?from=${from}&to=${to}`,
				{ credentials: "include" },
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(payload?.message ?? "Couldn’t download payroll time.");
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `payroll-time-${from}-${to}.csv`;
			link.click();
			URL.revokeObjectURL(url);
			toast.success("Approved time downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Couldn’t download payroll time.",
			);
		} finally {
			setIsDownloadingPayroll(false);
		}
	}

	function rangeActions(includeLeavePayroll = false) {
		return (
			<>
				<Field className="w-40">
					<FieldLabel htmlFor="report-from">From</FieldLabel>
					<DatePicker
						id="report-from"
						value={from}
						onValueChange={setFrom}
						displayValue={from}
					/>
				</Field>
				<Field className="w-40">
					<FieldLabel htmlFor="report-to">To</FieldLabel>
					<DatePicker
						id="report-to"
						value={to}
						onValueChange={setTo}
						displayValue={to}
					/>
				</Field>
				<Button
					variant="outline"
					disabled={invalidRange || isDownloading || !workplace}
					onClick={() => void download()}
				>
					{isDownloading ? "Downloading…" : "Download CSV"}
				</Button>
				{includeLeavePayroll ? (
					<>
						<Button
							variant="outline"
							disabled={invalidRange || isDownloadingPayroll || !workplace}
							onClick={() => void downloadPayrollTime()}
						>
							{isDownloadingPayroll ? "Downloading…" : "Approved time CSV"}
						</Button>
						<Button
							variant="outline"
							disabled={invalidRange || isDownloadingLeave || !workplace}
							onClick={() => void downloadLeavePayroll()}
						>
							{isDownloadingLeave ? "Downloading…" : "Leave payroll CSV"}
						</Button>
					</>
				) : null}
			</>
		);
	}

	const rangeError = invalidRange ? (
		<p role="alert" className="text-destructive text-sm">
			Choose an end date on or after the start date.
		</p>
	) : null;

	return (
		<AppDocument widthClassName="max-w-none">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading font-semibold text-xl tracking-tight md:text-2xl">
					Reports
				</h1>
				<p className="text-muted-foreground text-sm">
					Attendance, labor, coverage, requests, and leave in one place.
				</p>
			</div>
			<Tabs
				value={tab}
				onValueChange={(value) =>
					setTab(
						value as "attendance" | "hours" | "coverage" | "requests" | "leave",
					)
				}
				className="gap-4"
			>
				<TabsList variant="line">
					<TabsTrigger value="attendance">Attendance</TabsTrigger>
					<TabsTrigger value="hours">Hours & labor</TabsTrigger>
					<TabsTrigger value="coverage">Coverage</TabsTrigger>
					<TabsTrigger value="requests">Requests</TabsTrigger>
					{canViewReports ? (
						<TabsTrigger value="leave">Leave</TabsTrigger>
					) : null}
				</TabsList>

				<TabsContent value="attendance">
					<AttendanceReportView workplaceId={workplace?.id} />
				</TabsContent>

				<TabsContent value="hours" className="flex flex-col gap-4">
					<ReportSectionHeader
						title="Hours & labor"
						description="Worked time, labor cost, and sales for the selected range."
						actions={rangeActions()}
					/>
					{rangeError}
					{summary.isLoading ? (
						<div className="grid place-items-center py-24">
							<Spinner />
							<span className="sr-only">Loading report</span>
						</div>
					) : summary.isError ? (
						<Card>
							<CardHeader>
								<CardTitle>Couldn’t load the report</CardTitle>
								<CardDescription>
									Check your connection and try again.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button
									variant="outline"
									onClick={() => void summary.refetch()}
								>
									Try again
								</Button>
							</CardContent>
						</Card>
					) : !hasData ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No hours in this range</EmptyTitle>
								<EmptyDescription>
									Try a wider date range or check that time entries were
									recorded.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<>
							<ReportMetricGrid>
								<Card>
									<CardHeader>
										<CardDescription>Worked hours</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{formatHours(totals?.workedMinutes ?? 0)}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card>
									<CardHeader>
										<CardDescription>Labor cost</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{formatCurrency(totals?.laborCents ?? 0)}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card>
									<CardHeader>
										<CardDescription>Sales</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{formatCurrency(totals?.salesCents ?? 0)}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card>
									<CardHeader>
										<CardDescription>Labor %</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{formatPercent(totals?.laborPercent ?? null)}
										</CardTitle>
									</CardHeader>
								</Card>
							</ReportMetricGrid>

							<Card>
								<CardHeader>
									<CardTitle>Hours worked</CardTitle>
									<CardDescription>Worked hours per day</CardDescription>
								</CardHeader>
								<CardContent>
									<ChartContainer
										config={hoursConfig}
										className="h-[240px] w-full"
									>
										<BarChart accessibilityLayer data={days}>
											<CartesianGrid vertical={false} />
											<XAxis
												dataKey="label"
												tickLine={false}
												axisLine={false}
												tickMargin={8}
												minTickGap={24}
											/>
											<ChartTooltip
												cursor={false}
												content={<ChartTooltipContent indicator="dashed" />}
											/>
											<Bar
												dataKey="hours"
												fill="var(--color-hours)"
												radius={4}
											/>
										</BarChart>
									</ChartContainer>
								</CardContent>
							</Card>

							<div className="grid gap-6 lg:grid-cols-2">
								<Card>
									<CardHeader>
										<CardTitle>Labor cost vs sales</CardTitle>
										<CardDescription>Daily dollars</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={costConfig}
											className="h-[240px] w-full"
										>
											<BarChart accessibilityLayer data={days}>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="label"
													tickLine={false}
													axisLine={false}
													tickMargin={8}
													minTickGap={24}
												/>
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent
															indicator="dashed"
															formatter={(value) =>
																Number(value).toLocaleString("en-US", {
																	style: "currency",
																	currency: "USD",
																	maximumFractionDigits: 0,
																})
															}
														/>
													}
												/>
												<Bar
													dataKey="sales"
													fill="var(--color-sales)"
													radius={4}
												/>
												<Bar
													dataKey="labor"
													fill="var(--color-labor)"
													radius={4}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Labor %</CardTitle>
										<CardDescription>
											Labor cost as a share of sales
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={percentConfig}
											className="h-[240px] w-full"
										>
											<LineChart
												accessibilityLayer
												data={days}
												margin={{ left: 12, right: 12 }}
											>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="label"
													tickLine={false}
													axisLine={false}
													tickMargin={8}
													minTickGap={24}
												/>
												<YAxis
													tickLine={false}
													axisLine={false}
													width={40}
													tickFormatter={(value) => `${value}%`}
												/>
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent
															indicator="line"
															formatter={(value) =>
																value == null
																	? "—"
																	: `${Number(value).toFixed(1)}%`
															}
														/>
													}
												/>
												<Line
													dataKey="laborPercent"
													type="monotone"
													stroke="var(--color-laborPercent)"
													strokeWidth={2}
													dot={false}
													connectNulls
												/>
											</LineChart>
										</ChartContainer>
									</CardContent>
								</Card>
							</div>

							<div className="grid gap-6 lg:grid-cols-2">
								<Card>
									<CardHeader>
										<CardTitle>Hours by position</CardTitle>
										<CardDescription>Worked hours per position</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={positionConfig}
											className="mx-auto aspect-square max-h-[260px]"
										>
											<PieChart>
												<ChartTooltip
													cursor={false}
													content={
														<ChartTooltipContent hideLabel nameKey="key" />
													}
												/>
												<ChartLegend
													content={<ChartLegendContent nameKey="key" />}
												/>
												<Pie
													data={positions}
													dataKey="hours"
													nameKey="key"
													innerRadius={60}
													strokeWidth={4}
												>
													{positions.map((position) => (
														<Cell key={position.key} fill={position.color} />
													))}
												</Pie>
											</PieChart>
										</ChartContainer>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Hours by worker</CardTitle>
										<CardDescription>
											Top workers by worked hours
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={workerConfig}
											className="h-[260px] w-full"
										>
											<BarChart
												accessibilityLayer
												data={workers}
												layout="vertical"
												margin={{ left: 12, right: 12 }}
											>
												<CartesianGrid horizontal={false} />
												<XAxis type="number" dataKey="hours" hide />
												<YAxis
													type="category"
													dataKey="name"
													tickLine={false}
													axisLine={false}
													width={110}
												/>
												<ChartTooltip
													cursor={false}
													content={<ChartTooltipContent indicator="dashed" />}
												/>
												<Bar
													dataKey="hours"
													fill="var(--color-hours)"
													radius={4}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>
							</div>
						</>
					)}
				</TabsContent>

				<TabsContent value="coverage" className="flex flex-col gap-4">
					<ReportSectionHeader
						title="Coverage"
						description="Shift fill rate and scheduled-time utilization by location."
						actions={rangeActions()}
					/>
					{rangeError}
					{coverage.isLoading ? (
						<div className="grid place-items-center py-24">
							<Spinner />
							<span className="sr-only">Loading coverage report</span>
						</div>
					) : coverage.isError ? (
						<Card>
							<CardHeader>
								<CardTitle>Couldn’t load coverage</CardTitle>
								<CardDescription>
									Check your connection and try again.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button
									variant="outline"
									onClick={() => void coverage.refetch()}
								>
									Try again
								</Button>
							</CardContent>
						</Card>
					) : !coverageTotals || coverageTotals.scheduledShifts === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No scheduled shifts in this range</EmptyTitle>
								<EmptyDescription>
									Draft shifts for the selected range appear here once
									scheduled.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<>
							<ReportMetricGrid>
								<Card>
									<CardHeader>
										<CardDescription>Fill rate</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{formatRatio(coverageTotals.fillRate)}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card>
									<CardHeader>
										<CardDescription>Open shifts</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{coverageTotals.openShifts}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card>
									<CardHeader>
										<CardDescription>Scheduled shifts</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{coverageTotals.scheduledShifts}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card>
									<CardHeader>
										<CardDescription>Utilization</CardDescription>
										<CardTitle className="text-2xl tabular-nums">
											{formatRatio(coverageTotals.utilization)}
										</CardTitle>
									</CardHeader>
								</Card>
							</ReportMetricGrid>

							<Card>
								<CardHeader>
									<CardTitle>Fill rate & utilization</CardTitle>
									<CardDescription>
										Share of shifts assigned and minutes utilized per day
									</CardDescription>
								</CardHeader>
								<CardContent>
									<ChartContainer
										config={coverageConfig}
										className="h-[240px] w-full"
									>
										<BarChart accessibilityLayer data={coverageDays}>
											<CartesianGrid vertical={false} />
											<XAxis
												dataKey="label"
												tickLine={false}
												axisLine={false}
												tickMargin={8}
												minTickGap={24}
											/>
											<YAxis
												tickLine={false}
												axisLine={false}
												width={40}
												tickFormatter={(value) => `${value}%`}
											/>
											<ChartTooltip
												cursor={false}
												content={
													<ChartTooltipContent
														indicator="dashed"
														formatter={(value) =>
															`${Number(value).toFixed(1)}%`
														}
													/>
												}
											/>
											<Bar
												dataKey="fillRate"
												fill="var(--color-fillRate)"
												radius={4}
											/>
											<Bar
												dataKey="utilization"
												fill="var(--color-utilization)"
												radius={4}
											/>
										</BarChart>
									</ChartContainer>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>By location</CardTitle>
									<CardDescription>
										Coverage across locations in range
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="font-medium">
														Location
													</TableHead>
													<TableHead className="font-medium">
														Scheduled
													</TableHead>
													<TableHead className="font-medium">
														Assigned
													</TableHead>
													<TableHead className="font-medium">Open</TableHead>
													<TableHead className="font-medium">
														Fill rate
													</TableHead>
													<TableHead className="font-medium">
														Utilization
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{coverageLocations.map((location) => (
													<TableRow key={location.locationId}>
														<TableCell>{location.name}</TableCell>
														<TableCell className="tabular-nums">
															{location.scheduledShifts}
														</TableCell>
														<TableCell className="tabular-nums">
															{location.assignedShifts}
														</TableCell>
														<TableCell className="tabular-nums">
															{location.openShifts}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatRatio(location.fillRate)}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatRatio(location.utilization)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>
						</>
					)}
				</TabsContent>

				<TabsContent value="requests" className="flex flex-col gap-4">
					<ReportSectionHeader
						title="Requests"
						description="Request volume, outcomes, approval rates, and decision time."
						actions={rangeActions()}
					/>
					{rangeError}
					{requests.isLoading ? (
						<div className="grid place-items-center py-24">
							<Spinner />
							<span className="sr-only">Loading request analytics</span>
						</div>
					) : requests.isError ? (
						<Card>
							<CardHeader>
								<CardTitle>Couldn’t load request analytics</CardTitle>
								<CardDescription>
									Check your connection and try again.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button
									variant="outline"
									onClick={() => void requests.refetch()}
								>
									Try again
								</Button>
							</CardContent>
						</Card>
					) : requestRows.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No requests in this range</EmptyTitle>
								<EmptyDescription>
									Time-off, release, pickup, and swap requests appear here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<>
							<ReportMetricGrid>
								{requestRows.map((row) => (
									<Card key={row.type}>
										<CardHeader>
											<CardDescription>
												{REQUEST_LABELS[row.type]}
											</CardDescription>
											<CardTitle className="text-2xl tabular-nums">
												{row.total}
											</CardTitle>
										</CardHeader>
										<CardContent className="flex flex-col gap-0.5 text-muted-foreground text-xs">
											<span>{formatRatio(row.approvalRate)} approval rate</span>
											<span>
												{row.averageDecisionHours.toFixed(1)}h avg decision
											</span>
										</CardContent>
									</Card>
								))}
							</ReportMetricGrid>

							<Card>
								<CardHeader>
									<CardTitle>Request outcomes</CardTitle>
									<CardDescription>Counts by type and decision</CardDescription>
								</CardHeader>
								<CardContent>
									<ChartContainer
										config={requestConfig}
										className="h-[240px] w-full"
									>
										<BarChart accessibilityLayer data={requestChartData}>
											<CartesianGrid vertical={false} />
											<XAxis
												dataKey="label"
												tickLine={false}
												axisLine={false}
												tickMargin={8}
											/>
											<ChartTooltip
												cursor={false}
												content={<ChartTooltipContent indicator="dashed" />}
											/>
											<Bar
												dataKey="approved"
												fill="var(--color-approved)"
												radius={4}
											/>
											<Bar
												dataKey="declined"
												fill="var(--color-declined)"
												radius={4}
											/>
											<Bar
												dataKey="pending"
												fill="var(--color-pending)"
												radius={4}
											/>
										</BarChart>
									</ChartContainer>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Approval & cycle time</CardTitle>
									<CardDescription>
										Approval rate and average hours from request to decision
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="font-medium">Type</TableHead>
													<TableHead className="font-medium">Total</TableHead>
													<TableHead className="font-medium">
														Approved
													</TableHead>
													<TableHead className="font-medium">
														Declined
													</TableHead>
													<TableHead className="font-medium">Pending</TableHead>
													<TableHead className="font-medium">
														Approval rate
													</TableHead>
													<TableHead className="font-medium">
														Avg decision
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{requestRows.map((row) => (
													<TableRow key={row.type}>
														<TableCell>{REQUEST_LABELS[row.type]}</TableCell>
														<TableCell className="tabular-nums">
															{row.total}
														</TableCell>
														<TableCell className="tabular-nums">
															{row.approved}
														</TableCell>
														<TableCell className="tabular-nums">
															{row.declined}
														</TableCell>
														<TableCell className="tabular-nums">
															{row.pending}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatRatio(row.approvalRate)}
														</TableCell>
														<TableCell className="tabular-nums">
															{row.averageDecisionHours.toFixed(1)}h
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>
						</>
					)}
				</TabsContent>

				{canViewReports ? (
					<TabsContent value="leave" className="flex flex-col gap-4">
						<ReportSectionHeader
							title="Leave"
							description="Approved, unpaid, overdrawn, and encashed leave by worker."
							actions={rangeActions(true)}
						/>
						{rangeError}
						{leave.isLoading ? (
							<div className="grid place-items-center py-24">
								<Spinner />
								<span className="sr-only">Loading leave report</span>
							</div>
						) : leave.isError ? (
							<Card>
								<CardHeader>
									<CardTitle>Couldn’t load the leave report</CardTitle>
									<CardDescription>
										Check your connection and try again.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<Button
										variant="outline"
										onClick={() => void leave.refetch()}
									>
										Try again
									</Button>
								</CardContent>
							</Card>
						) : !leave.data || leave.data.rows.length === 0 ? (
							<Empty>
								<EmptyHeader>
									<EmptyTitle>No leave in this range</EmptyTitle>
									<EmptyDescription>
										Approved leave and encashments appear here.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<>
								<ReportMetricGrid>
									<Card>
										<CardHeader>
											<CardDescription>Approved leave</CardDescription>
											<CardTitle className="text-2xl tabular-nums">
												{formatLeaveHours(leave.data.totals.approvedMinutes)}
											</CardTitle>
										</CardHeader>
									</Card>
									<Card>
										<CardHeader>
											<CardDescription>Unpaid leave</CardDescription>
											<CardTitle className="text-2xl tabular-nums">
												{formatLeaveHours(leave.data.totals.unpaidMinutes)}
											</CardTitle>
										</CardHeader>
									</Card>
									<Card>
										<CardHeader>
											<CardDescription>Overdrawn</CardDescription>
											<CardTitle className="text-2xl tabular-nums">
												{formatLeaveHours(leave.data.totals.overdrawnMinutes)}
											</CardTitle>
										</CardHeader>
									</Card>
									<Card>
										<CardHeader>
											<CardDescription>Encashment value</CardDescription>
											<CardTitle className="text-2xl tabular-nums">
												{formatCurrency(leave.data.totals.encashmentCents)}
											</CardTitle>
										</CardHeader>
									</Card>
								</ReportMetricGrid>

								<Card>
									<CardHeader>
										<CardTitle>Leave by worker</CardTitle>
										<CardDescription>
											Approved leave and encashments in the selected range
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="font-medium">
															Worker
														</TableHead>
														<TableHead className="font-medium">
															Leave type
														</TableHead>
														<TableHead className="font-medium">
															Approved
														</TableHead>
														<TableHead className="font-medium">
															Unpaid
														</TableHead>
														<TableHead className="font-medium">
															Overdrawn
														</TableHead>
														<TableHead className="font-medium">
															Encashed
														</TableHead>
														<TableHead className="font-medium">Value</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{leave.data.rows.map((row) => (
														<TableRow
															key={`${row.employmentId}:${row.leaveTypeName}`}
														>
															<TableCell>
																<div className="flex flex-col">
																	<span>
																		{row.employmentName ?? row.employmentEmail}
																	</span>
																	{row.employmentName ? (
																		<span className="text-muted-foreground text-xs">
																			{row.employmentEmail}
																		</span>
																	) : null}
																</div>
															</TableCell>
															<TableCell>
																{row.leaveTypeName}
																{row.leaveTypePaid ? null : (
																	<span className="text-muted-foreground">
																		{" "}
																		· unpaid
																	</span>
																)}
															</TableCell>
															<TableCell className="tabular-nums">
																{formatLeaveHours(row.approvedMinutes)}
															</TableCell>
															<TableCell className="tabular-nums">
																{formatLeaveHours(row.unpaidMinutes)}
															</TableCell>
															<TableCell className="tabular-nums">
																{formatLeaveHours(row.overdrawnMinutes)}
															</TableCell>
															<TableCell className="tabular-nums">
																{formatLeaveHours(row.encashmentMinutes)}
															</TableCell>
															<TableCell className="tabular-nums">
																{formatCurrency(row.encashmentCents)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
												<TableFooter>
													<TableRow>
														<TableCell>Total</TableCell>
														<TableCell />
														<TableCell className="tabular-nums">
															{formatLeaveHours(
																leave.data.totals.approvedMinutes,
															)}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatLeaveHours(
																leave.data.totals.unpaidMinutes,
															)}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatLeaveHours(
																leave.data.totals.overdrawnMinutes,
															)}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatLeaveHours(
																leave.data.totals.encashmentMinutes,
															)}
														</TableCell>
														<TableCell className="tabular-nums">
															{formatCurrency(
																leave.data.totals.encashmentCents,
															)}
														</TableCell>
													</TableRow>
												</TableFooter>
											</Table>
										</div>
									</CardContent>
								</Card>
							</>
						)}
					</TabsContent>
				) : null}
			</Tabs>
		</AppDocument>
	);
}
