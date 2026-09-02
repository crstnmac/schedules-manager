import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useDraggable } from "@dnd-kit/react";
import { AlertTriangleIcon } from "lucide-react";

import {
	formatCompactShiftRange,
	positionColor,
	shiftDisplayStatus,
} from "@/lib/schedule-calendar";
import type { ScheduleResponse, ScheduleShiftDto } from "@/lib/queries";

function statusVariant(tone: "danger" | "warning" | "info") {
	if (tone === "danger") return "destructive" as const;
	if (tone === "warning") return "outline" as const;
	return "secondary" as const;
}

export function ShiftTile({
	shift,
	onOpen,
	onToggleSelect,
	selected = false,
	compact = false,
	disabled = false,
	draggable = true,
	showWorker = false,
	timeclock,
}: {
	shift: ScheduleShiftDto;
	onOpen: (shift: ScheduleShiftDto) => void;
	onToggleSelect?: (shift: ScheduleShiftDto) => void;
	selected?: boolean;
	compact?: boolean;
	disabled?: boolean;
	draggable?: boolean;
	showWorker?: boolean;
	timeclock?: ScheduleResponse["timeclock"][number];
}) {
	const hasConflicts = shift.conflicts.length > 0;
	const isOpen = shift.employmentId === null;
	const color = positionColor(shift.positionName);
	const scheduledMinutes =
		(new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) /
		60_000;
	const status = shiftDisplayStatus({
		hasConflicts,
		attendance: timeclock?.attendance,
		clockStatus: timeclock?.status,
		clockedInAt: timeclock?.clockedInAt,
		workedMinutes: timeclock?.workedMinutes,
		scheduledMinutes,
		shiftEndedAt: shift.endsAt,
	});
	const timeLabel = formatCompactShiftRange(
		shift.startMinute,
		shift.endMinute,
		shift.overnight,
	);
	const workerLabel = isOpen ? "Open" : (shift.workerName ?? "Unassigned");
	const { ref, isDragging, isDropping } = useDraggable({
		id: `shift:${shift.id}`,
		type: "schedule-shift",
		data: { shiftId: shift.id },
		disabled: disabled || !draggable,
	});

	return (
		<Button
			ref={ref}
			type="button"
			variant="ghost"
			data-press="subtle"
			title={[
				timeLabel,
				workerLabel,
				shift.positionName,
				status ? [status.label, status.detail].filter(Boolean).join(" ") : null,
			]
				.filter(Boolean)
				.join(" · ")}
			aria-label={`${timeLabel}, ${workerLabel}, ${shift.positionName}${status ? `, ${status.label}` : ""}. Activate to edit or move this shift.`}
			onClick={(event) => {
				if (event.shiftKey || event.metaKey) {
					onToggleSelect?.(shift);
					return;
				}
				onOpen(shift);
			}}
			className={cn(
				"h-auto w-full cursor-grab touch-none flex-col items-stretch gap-1 overflow-hidden whitespace-normal rounded-md border px-2 py-1.5 text-left shadow-xs transition-[background-color,border-color,box-shadow,opacity] hover:shadow-sm active:cursor-grabbing motion-reduce:transition-none",
				compact ? "min-h-9 gap-0.5 py-1" : "min-h-11",
				(isDragging || isDropping) && "opacity-45 ring-2 ring-primary/30",
				selected && "ring-2 ring-primary",
				hasConflicts
					? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
					: isOpen
						? "border-warning-border bg-warning text-warning-foreground hover:bg-warning/80"
						: cn("border-transparent", color.block),
			)}
		>
			<span className="w-full shrink-0 font-medium text-xs tabular-nums leading-none">
				{timeLabel}
			</span>
			<span className="flex w-full min-w-0 items-center gap-1">
				<span className="min-w-0 truncate text-[11px] leading-tight">
					{showWorker ? workerLabel : shift.positionName}
				</span>
				{status ? (
					<Badge
						variant={statusVariant(status.tone)}
						className={cn(
							"ml-auto h-4 shrink-0 px-1.5 font-medium text-[10px]",
							hasConflicts && "border-transparent",
							status.tone === "warning" &&
								"border-warning-border bg-background/70 text-warning-foreground",
						)}
					>
						{status.kind === "conflict" ? (
							<AlertTriangleIcon data-icon="inline-start" />
						) : null}
						{status.label}
					</Badge>
				) : null}
			</span>
			{showWorker ? (
				<span className="w-full truncate text-[10px] leading-tight opacity-80">
					{shift.positionName}
				</span>
			) : null}
		</Button>
	);
}
