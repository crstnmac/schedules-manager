import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@SchedulesManager/ui/components/table";

import { formatLeaveHours } from "@/lib/leave";
import type { LeaveForecastDto } from "@/lib/queries";

function formatMonth(month: string) {
	const date = new Date(`${month}-01T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return month;
	return date.toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

/**
 * One section per leave type with a month-by-month accrual and usage
 * projection. Pending requests are surfaced in the header because they are not
 * yet part of the projected balance.
 */
export function LeaveForecastTable({
	forecast,
	isLoading,
}: {
	forecast: LeaveForecastDto[] | undefined;
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<div role="status" className="flex flex-col gap-2 p-4">
				<span className="sr-only">Loading forecast…</span>
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
			</div>
		);
	}

	if (!forecast || forecast.length === 0) {
		return (
			<p className="p-4 text-muted-foreground text-sm">
				No accrual policy to forecast yet.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{forecast.map((section) => (
				<section
					key={section.leaveTypeId}
					className="overflow-hidden rounded-xl border"
				>
					<header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
						<span className="font-medium text-sm">{section.leaveTypeName}</span>
						<div className="flex flex-wrap gap-3 text-muted-foreground text-xs tabular-nums">
							<span>Starting {formatLeaveHours(section.startingMinutes)}</span>
							<span>
								Pending {formatLeaveHours(section.pendingMinutes)} awaiting a
								decision
							</span>
						</div>
					</header>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="font-medium">Month</TableHead>
									<TableHead className="font-medium">Accrued</TableHead>
									<TableHead className="font-medium">Planned usage</TableHead>
									<TableHead className="font-medium">
										Projected balance
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{section.points.map((point) => (
									<TableRow key={point.month}>
										<TableCell className="whitespace-nowrap">
											{formatMonth(point.month)}
										</TableCell>
										<TableCell className="tabular-nums">
											{formatLeaveHours(point.accruedMinutes)}
										</TableCell>
										<TableCell className="tabular-nums">
											{formatLeaveHours(point.plannedUsageMinutes)}
										</TableCell>
										<TableCell className="font-medium tabular-nums">
											{formatLeaveHours(point.balanceMinutes)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</section>
			))}
		</div>
	);
}
