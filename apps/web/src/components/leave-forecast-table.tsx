import { Spinner } from "@SchedulesManager/ui/components/spinner";

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
			<div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
				<Spinner /> Loading forecast…
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
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left text-muted-foreground text-xs">
									<th className="px-3 py-2 font-medium">Month</th>
									<th className="px-3 py-2 font-medium">Accrued</th>
									<th className="px-3 py-2 font-medium">Planned usage</th>
									<th className="px-3 py-2 font-medium">Projected balance</th>
								</tr>
							</thead>
							<tbody>
								{section.points.map((point) => (
									<tr key={point.month} className="border-b last:border-0">
										<td className="whitespace-nowrap px-3 py-2">
											{formatMonth(point.month)}
										</td>
										<td className="px-3 py-2 tabular-nums">
											{formatLeaveHours(point.accruedMinutes)}
										</td>
										<td className="px-3 py-2 tabular-nums">
											{formatLeaveHours(point.plannedUsageMinutes)}
										</td>
										<td className="px-3 py-2 font-medium tabular-nums">
											{formatLeaveHours(point.balanceMinutes)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			))}
		</div>
	);
}
