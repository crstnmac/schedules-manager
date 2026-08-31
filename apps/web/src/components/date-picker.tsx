import { Button } from "@SchedulesManager/ui/components/button";
import { Calendar } from "@SchedulesManager/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@SchedulesManager/ui/components/popover";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { formatDay, parseIsoDate, toIsoDate } from "@/lib/time";

export function DatePicker({
	id,
	value,
	onValueChange,
	placeholder = "Pick a date",
	disabled,
	displayValue,
	buttonClassName,
}: {
	id?: string;
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	disabled?: (date: Date) => boolean;
	displayValue?: string;
	buttonClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = parseIsoDate(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						id={id}
						className={cn(
							"w-full justify-between data-[empty=true]:text-muted-foreground",
							buttonClassName,
						)}
						data-empty={!selected}
					/>
				}
			>
				{selected ? (displayValue ?? formatDay(value)) : placeholder}
				<ChevronDownIcon data-icon="inline-end" />
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					disabled={disabled}
					onSelect={(date) => {
						if (!date) return;
						onValueChange(toIsoDate(date));
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
