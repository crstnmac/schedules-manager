import { Badge } from "@SchedulesManager/ui/components/badge";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { cn } from "@SchedulesManager/ui/lib/utils";

import { formatLeaveHours } from "@/lib/leave";
import type { LeaveLedgerEntryDto } from "@/lib/queries";
import { formatDay } from "@/lib/time";

const KIND_LABELS: Record<LeaveLedgerEntryDto["kind"], string> = {
	initial: "Initial",
	accrual: "Accrual",
	usage: "Usage",
	adjustment: "Adjustment",
	carry_forward: "Carry forward",
	expiry: "Expiry",
	encashment: "Encashment",
	transfer_in: "Transfer in",
	transfer_out: "Transfer out",
	restoration: "Restoration",
};

const KIND_VARIANTS: Record<
	LeaveLedgerEntryDto["kind"],
	"default" | "secondary" | "destructive" | "outline"
> = {
	initial: "outline",
	accrual: "secondary",
	usage: "default",
	adjustment: "outline",
	carry_forward: "secondary",
	expiry: "destructive",
	encashment: "default",
	transfer_in: "secondary",
	transfer_out: "outline",
	restoration: "secondary",
};

function signedHours(minutes: number) {
	const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
	return `${sign}${formatLeaveHours(Math.abs(minutes))}`;
}

function balanceHours(minutes: number) {
	return minutes < 0
		? `-${formatLeaveHours(Math.abs(minutes))}`
		: formatLeaveHours(minutes);
}

/**
 * Dense, reusable view of leave ledger entries for both worker and manager
 * surfaces. Entries are expected newest-first, as the API returns them.
 */
export function LeaveLedgerList({
	entries,
	isLoading,
	emptyLabel,
}: {
	entries: LeaveLedgerEntryDto[] | undefined;
	isLoading?: boolean;
	emptyLabel?: string;
}) {
	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
				<Spinner /> Loading ledger…
			</div>
		);
	}

	if (!entries || entries.length === 0) {
		return (
			<p className="p-4 text-muted-foreground text-sm">
				{emptyLabel ?? "No leave ledger entries yet."}
			</p>
		);
	}

	return (
		<ol className="divide-y overflow-hidden rounded-xl border">
			{entries.map((entry) => (
				<li
					key={entry.id}
					className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3"
				>
					<span className="w-24 shrink-0 text-muted-foreground text-xs tabular-nums">
						{formatDay(entry.effectiveDate)}
					</span>
					<Badge
						variant={KIND_VARIANTS[entry.kind]}
						className="w-fit uppercase"
					>
						{KIND_LABELS[entry.kind]}
					</Badge>
					<span className="text-muted-foreground text-xs">
						{entry.leaveTypeName}
					</span>
					<span
						className={cn(
							"font-medium tabular-nums sm:ml-auto",
							entry.minutes < 0 && "text-destructive",
						)}
					>
						{signedHours(entry.minutes)}
					</span>
					<span className="text-muted-foreground text-xs tabular-nums">
						Balance {balanceHours(entry.balanceAfter)}
					</span>
					{entry.note ? (
						<span className="w-full truncate text-muted-foreground text-xs sm:w-auto">
							{entry.note}
						</span>
					) : null}
				</li>
			))}
		</ol>
	);
}
