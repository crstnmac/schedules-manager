import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";

import { formatMinute } from "@/lib/time";

const STEP_MINUTES = 30;

function timeItems(overnightAfterMinute?: number) {
	const items = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, index) => {
		const minute = index * STEP_MINUTES;
		return {
			label: `${formatMinute(minute)}${
				overnightAfterMinute != null && minute <= overnightAfterMinute
					? " +1"
					: ""
			}`,
			value: String(minute),
		};
	});
	return items;
}

export function TimePicker({
	id,
	value,
	onValueChange,
	overnightAfterMinute,
}: {
	id?: string;
	value: number;
	onValueChange: (minute: number) => void;
	overnightAfterMinute?: number;
}) {
	const items = timeItems(overnightAfterMinute);
	const selected = String(value);
	const options = items.some((item) => item.value === selected)
		? items
		: [{ label: formatMinute(value), value: selected }, ...items];

	return (
		<Select
			items={options}
			value={selected}
			onValueChange={(next) => {
				if (next == null) return;
				onValueChange(Number(next));
			}}
		>
			<SelectTrigger id={id} className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				<SelectGroup>
					{options.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
