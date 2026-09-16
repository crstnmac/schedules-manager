import { Button } from "@SchedulesManager/ui/components/button";
import { Calendar } from "@SchedulesManager/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@SchedulesManager/ui/components/popover";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { CalendarDaysIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

function parseMonth(value: string) {
	const [year, month] = value.split("-").map(Number);
	if (!year || !month) return undefined;
	return new Date(year, month - 1, 1);
}

function formatMonth(date: Date) {
	return new Intl.DateTimeFormat("en-US", {
		month: "long",
		year: "numeric",
	}).format(date);
}

export function MonthPicker({
	id,
	value,
	onValueChange,
	className,
}: {
	id?: string;
	value: string;
	onValueChange: (value: string) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = parseMonth(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						id={id}
						className={cn(
							"min-w-0 justify-between overflow-hidden font-normal",
							className,
						)}
					/>
				}
			>
				<span className="flex min-w-0 items-center gap-2">
					<CalendarDaysIcon
						data-icon="inline-start"
						className="shrink-0 text-muted-foreground"
					/>
					<span className="truncate">
						{selected ? formatMonth(selected) : "Choose month"}
					</span>
				</span>
				<ChevronDownIcon
					data-icon="inline-end"
					className="shrink-0 text-muted-foreground"
				/>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					captionLayout="dropdown"
					startMonth={new Date(2020, 0)}
					endMonth={new Date(new Date().getFullYear() + 2, 11)}
					onSelect={(date) => {
						if (!date) return;
						onValueChange(
							`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
						);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
