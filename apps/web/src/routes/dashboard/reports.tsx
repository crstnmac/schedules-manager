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
import { DatePicker } from "@/components/date-picker";
import { useReportSummary } from "@/lib/queries";
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

function shortDate(key: string) {
	return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function ReportsPage() {
	const { workplace } = useWorkplace();
	const [from, setFrom] = useState(() => {
		const date = new Date();
		date.setDate(date.getDate() - 14);
		return date.toLocaleDateString("sv-SE");
	});
	const [to, setTo] = useState(() => new Date().toLocaleDateString("sv-SE"));
	const [isDownloading, setIsDownloading] = useState(false);
	const invalidRange = !from || !to || from > to;

	const summary = useReportSummary(workplace?.id, from, to, !invalidRange);

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
	const positionConfig = {
		hours: { label: "Hours" },
		...Object.fromEntries(
			positions.map((position) => [
				position.key,
				{ label: position.name, color: position.color },
			]),
		),
	} satisfies ChartConfig;
	const workerConfig = {
		hours: { label: "Hours", color: "var(--chart-2)" },
	} satisfies ChartConfig;

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

	return (
		<AppDocument widthClassName="max-w-5xl">
			<div className="flex flex-col gap-4">
				<div>
					<h2 className="font-heading font-medium text-sm">Hours and labor</h2>
					<p className="text-muted-foreground text-xs/relaxed">
						Worked hours, labor cost, sales, and labor percentage for the
						selected range.
					</p>
				</div>
				<div className="flex flex-wrap items-end gap-3">
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
				</div>
			</div>
			{invalidRange ? (
				<p role="alert" className="text-destructive text-sm">
					Choose an end date on or after the start date.
				</p>
			) : null}

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
						<Button variant="outline" onClick={() => void summary.refetch()}>
							Try again
						</Button>
					</CardContent>
				</Card>
			) : !hasData ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>No hours in this range</EmptyTitle>
						<EmptyDescription>
							Try a wider date range or check that time entries were recorded.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Hours worked</CardTitle>
							<CardDescription>Worked hours per day</CardDescription>
						</CardHeader>
						<CardContent>
							<ChartContainer config={hoursConfig} className="h-[240px] w-full">
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
									<Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
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
										<Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
										<Bar dataKey="labor" fill="var(--color-labor)" radius={4} />
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
														value == null ? "—" : `${Number(value).toFixed(1)}%`
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
											content={<ChartTooltipContent hideLabel nameKey="key" />}
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
								<CardDescription>Top workers by worked hours</CardDescription>
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
										<Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
									</BarChart>
								</ChartContainer>
							</CardContent>
						</Card>
					</div>
				</>
			)}
		</AppDocument>
	);
}
