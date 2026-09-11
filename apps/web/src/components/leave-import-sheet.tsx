import { type ImportMode, ImportSheet } from "@/components/import-sheet";
import { formatLeaveHours } from "@/lib/leave";

interface LeaveImportEntry {
	line: number;
	workerEmail: string;
	workerName: string | null;
	leaveTypeName: string;
	startDate: string;
	endDate: string;
	allDay: boolean;
	chargeMinutes: number;
	status: string;
	mode?: "set" | "add";
	effectiveDate?: string;
}

/**
 * Bulk entry for leave records (approved or pending) and opening balances.
 * Both paths preview with a dry run before anything is written and report
 * failures per source line so the CSV can be fixed in place.
 */
export function LeaveImportSheet({
	open,
	onOpenChange,
	workplaceId,
	onImported,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workplaceId: string;
	onImported: () => void;
}) {
	const modes: ImportMode[] = [
		{
			value: "records",
			label: "Leave records",
			importPath: `/v1/workplaces/${workplaceId}/time-off/import`,
			templatePath: `/v1/workplaces/${workplaceId}/time-off/import/template.csv`,
			templateFileName: "leave-import-template.csv",
			successNoun: "leave record(s)",
			help: (
				<p>
					Columns: <span className="font-medium">worker_email</span>,{" "}
					<span className="font-medium">leave_type</span> (name or code),{" "}
					<span className="font-medium">start_date</span>, optional{" "}
					<span className="font-medium">end_date</span>,{" "}
					<span className="font-medium">all_day</span>,{" "}
					<span className="font-medium">start_time</span>/
					<span className="font-medium">end_time</span> (partial days),{" "}
					<span className="font-medium">reason</span>,{" "}
					<span className="font-medium">status</span> (approved or pending,
					default approved) and <span className="font-medium">emergency</span>.
					Approved rows deduct balances; pending rows enter the approval queue.
				</p>
			),
		},
		{
			value: "balances",
			label: "Opening balances",
			importPath: `/v1/workplaces/${workplaceId}/leave-balances/import`,
			templatePath: `/v1/workplaces/${workplaceId}/leave-balances/import/template.csv`,
			templateFileName: "leave-balance-import-template.csv",
			successNoun: "balance(s)",
			help: (
				<p>
					Columns: <span className="font-medium">worker_email</span>,{" "}
					<span className="font-medium">leave_type</span>,{" "}
					<span className="font-medium">hours</span> or{" "}
					<span className="font-medium">minutes</span>, optional{" "}
					<span className="font-medium">mode</span> (set = replace balance, add
					= adjust by amount, default set),{" "}
					<span className="font-medium">effective_date</span> and{" "}
					<span className="font-medium">note</span>. Re-importing a set row
					leaves the balance unchanged.
				</p>
			),
		},
	];

	return (
		<ImportSheet<LeaveImportEntry>
			open={open}
			onOpenChange={onOpenChange}
			title="Import leave from CSV"
			description="Upload a CSV to create leave records or set opening balances. Nothing is written until you import, and every preview shows exactly what will happen."
			modes={modes}
			entryKey={(entry) =>
				`${entry.line}-${entry.startDate}-${entry.leaveTypeName}`
			}
			renderEntry={(entry) => (
				<>
					<div className="min-w-0">
						<p className="truncate font-medium">
							{entry.workerName ?? entry.workerEmail}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							{entry.leaveTypeName} ·{" "}
							{entry.effectiveDate ??
								(entry.startDate === entry.endDate
									? entry.startDate
									: `${entry.startDate} → ${entry.endDate}`)}
							{entry.mode ? ` · ${entry.mode}` : ""}
						</p>
					</div>
					<div className="shrink-0 text-right text-xs">
						{entry.mode ? (
							<span className="tabular-nums">
								{formatLeaveHours(entry.chargeMinutes)}
							</span>
						) : (
							<span className="tabular-nums">
								{formatLeaveHours(entry.chargeMinutes)} · {entry.status}
							</span>
						)}
					</div>
				</>
			)}
			onImported={onImported}
		/>
	);
}
