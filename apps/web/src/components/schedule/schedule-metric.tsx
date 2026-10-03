import { Badge } from "@SchedulesManager/ui/components/badge";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { memo } from "react";

export const ScheduleMetric = memo(function ScheduleMetric({
	value,
	label,
	tone = "default",
}: {
	value: string | number;
	label: string;
	tone?: "default" | "emphasis" | "danger";
}) {
	return (
		<Badge
			variant={tone === "danger" ? "destructive" : "outline"}
			className={cn(
				"h-6 gap-1 rounded-md px-2 font-normal tabular-nums",
				tone === "emphasis" && "border-primary/30 bg-primary/5 text-foreground",
			)}
		>
			<span className="font-semibold">{value}</span>
			<span
				className={cn(
					tone === "danger" ? "opacity-90" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</Badge>
	);
});
