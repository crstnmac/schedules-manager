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
	ChartTooltip,
	ChartTooltipContent,
} from "@SchedulesManager/ui/components/chart";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useCallback, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { AttendanceTable } from "@/components/attendance-table";
import { MonthPicker } from "@/components/month-picker";
import { ReportSectionHeader } from "@/components/report-layout";
import { type AttendanceStatus, useAttendanceReport } from "@/lib/queries";

const statusMeta: Record<
	AttendanceStatus,
	{ label: string; short: string; className: string }
> = {
	present: {
		label: "Present",
		short: "P",
		className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	},
	late: {
		label: "Late",
		short: "L",
		className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
	},
	absent: {
		label: "Absent",
		short: "A",
		className: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
	},
	sick: {
		label: "Sick",
		short: "S",
		className: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
	},
	scheduled: {
		label: "Scheduled",
		short: "•",
		className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
	},
};

const chartConfig = {
	present: { label: "Present", color: "var(--chart-4)" },
	late: { label: "Late", color: "var(--chart-3)" },
	absent: { label: "Absent", color: "var(--destructive)" },
	sick: { label: "Sick", color: "var(--chart-1)" },
} satisfies ChartConfig;

function rangeForMonth(month: string) {
	const [year, rawMonth] = month.split("-").map(Number);
	const lastDay = new Date(year, rawMonth, 0).getDate();
	return {
		from: `${month}-01`,
		to: `${month}-${String(lastDay).padStart(2, "0")}`,
	};
}

function dayLabel(date: string) {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
		day: "numeric",
		weekday: "short",
		timeZone: "UTC",
	});
}

export function AttendanceReportView({
	workplaceId,
}: {
	workplaceId?: string;
}) {
	const [month, setMonth] = useState(() =>
		new Date().toLocaleDateString("sv-SE").slice(0, 7),
	);
	const [search, setSearch] = useState("");
	const range = useMemo(() => rangeForMonth(month), [month]);
	const report = useAttendanceReport(workplaceId, range.from, range.to);
	const dates = report.data?.byDate.map((day) => day.date) ?? [];
	const workers = useMemo(() => {
		const term = search.trim().toLowerCase();
		return (report.data?.workers ?? []).filter(
			(worker) =>
				!term ||
				worker.name.toLowerCase().includes(term) ||
				worker.positions.some((position) =>
					position.toLowerCase().includes(term),
				),
		);
	}, [report.data?.workers, search]);
	const chartData = (report.data?.byDate ?? []).map((day) => ({
		...day,
		label: new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", {
			day: "numeric",
			timeZone: "UTC",
		}),
	}));
	const renderStatus = useCallback(
		(status: AttendanceStatus | undefined) =>
			status ? (
				<span
					title={statusMeta[status].label}
					className={cn(
						"inline-grid size-7 place-items-center rounded-md font-semibold text-xs",
						statusMeta[status].className,
					)}
				>
					{statusMeta[status].short}
				</span>
			) : (
				<span className="text-muted-foreground/30">—</span>
			),
		[],
	);

	return (
		<div className="flex flex-col gap-4">
			<ReportSectionHeader
				title="Monthly attendance"
				description="Daily attendance from published shifts and clock records."
				actions={
					<>
						<label
							htmlFor="attendance-month"
							className="grid gap-1 text-muted-foreground text-xs"
						>
							Month
							<MonthPicker
								id="attendance-month"
								value={month}
								onValueChange={setMonth}
								className="w-48"
							/>
						</label>
						<label
							htmlFor="attendance-search"
							className="grid gap-1 text-muted-foreground text-xs"
						>
							Find worker
							<Input
								id="attendance-search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Name or position"
								className="w-48"
							/>
						</label>
					</>
				}
			/>

			<div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-muted/20 px-3 py-2">
				{(Object.keys(statusMeta) as AttendanceStatus[]).map((status) => (
					<div key={status} className="flex items-center gap-2 text-xs">
						<span
							className={cn(
								"grid size-6 place-items-center rounded-md font-semibold",
								statusMeta[status].className,
							)}
						>
							{statusMeta[status].short}
						</span>
						<span className="text-muted-foreground">
							{statusMeta[status].label}
						</span>
					</div>
				))}
			</div>

			{report.isLoading ? (
				<div className="grid place-items-center py-24">
					<Spinner />
					<span className="sr-only">Loading attendance report</span>
				</div>
			) : report.isError ? (
				<Card>
					<CardHeader>
						<CardTitle>Couldn’t load attendance</CardTitle>
						<CardDescription>
							Check your connection and try again.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button variant="outline" onClick={() => void report.refetch()}>
							Try again
						</Button>
					</CardContent>
				</Card>
			) : !report.data?.workers.length ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>No attendance records this month</EmptyTitle>
						<EmptyDescription>
							Publish assigned shifts and record attendance to populate this
							view.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Daily attendance trend</CardTitle>
							<CardDescription>
								Worker count by attendance outcome
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ChartContainer config={chartConfig} className="h-[260px] w-full">
								<LineChart
									accessibilityLayer
									data={chartData}
									margin={{ left: 0, right: 12 }}
								>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="label"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={20}
									/>
									<YAxis
										allowDecimals={false}
										tickLine={false}
										axisLine={false}
										width={28}
									/>
									<ChartTooltip
										cursor={false}
										content={<ChartTooltipContent indicator="line" />}
									/>
									<Line
										dataKey="present"
										type="monotone"
										stroke="var(--color-present)"
										strokeWidth={2}
										dot={false}
									/>
									<Line
										dataKey="late"
										type="monotone"
										stroke="var(--color-late)"
										strokeWidth={2}
										dot={false}
									/>
									<Line
										dataKey="absent"
										type="monotone"
										stroke="var(--color-absent)"
										strokeWidth={2}
										dot={false}
									/>
									<Line
										dataKey="sick"
										type="monotone"
										stroke="var(--color-sick)"
										strokeWidth={2}
										dot={false}
									/>
								</LineChart>
							</ChartContainer>
						</CardContent>
					</Card>

					<Card className="py-0">
						<AttendanceTable
							workers={workers}
							dates={dates}
							dayLabel={dayLabel}
							renderStatus={renderStatus}
						/>
					</Card>
				</>
			)}
		</div>
	);
}
