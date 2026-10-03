import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@SchedulesManager/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { ListFilterIcon, SearchIcon, XIcon } from "lucide-react";
import { type ChangeEvent, memo, useCallback, useMemo } from "react";
import { ScheduleMetric } from "@/components/schedule/schedule-metric";
import type { ScheduleResponse } from "@/lib/queries";
import { useGroups, useTags, useTimeBlocks } from "@/lib/queries";
import { positionColor } from "@/lib/schedule-calendar";
import { useWorkplace } from "@/lib/use-workplace";

export type GridDensity = "compact" | "comfortable";

export interface ScheduleFilters {
	workerQuery: string;
	positionFilter: string;
	staffStateFilter: string;
	groupFilter: string;
	tagFilter: string;
	timeBlockFilter: string;
}

export const DEFAULT_SCHEDULE_FILTERS: ScheduleFilters = {
	workerQuery: "",
	positionFilter: "all",
	staffStateFilter: "all",
	groupFilter: "all",
	tagFilter: "all",
	timeBlockFilter: "all",
};

const STATE_ITEMS = [
	{ label: "All workers", value: "all" },
	{ label: "Scheduled", value: "scheduled" },
	{ label: "Unscheduled", value: "unscheduled" },
	{ label: "Has constraints", value: "constraints" },
];

/** Filter row above the grid: search, filter popover, counts. */
export const ScheduleFilterBar = memo(function ScheduleFilterBar({
	hasStaff,
	hasData,
	positions,
	locationId,
	filters,
	onFilterChange,
	onClearFilters,
	density,
	onDensityChange,
	showDensity,
	openShiftCount,
	conflictCount,
	onClockCount,
}: {
	/** The loaded week has at least one worker on its roster. */
	hasStaff: boolean;
	hasData: boolean;
	positions: ScheduleResponse["positions"] | undefined;
	locationId: string | undefined;
	filters: ScheduleFilters;
	onFilterChange: (key: keyof ScheduleFilters, value: string) => void;
	onClearFilters: () => void;
	density: GridDensity;
	onDensityChange: (density: GridDensity) => void;
	showDensity: boolean;
	openShiftCount: number;
	conflictCount: number;
	onClockCount: number;
}) {
	const { workplace } = useWorkplace();
	const groups = useGroups(workplace?.id);
	const tags = useTags(workplace?.id);
	const timeBlocks = useTimeBlocks(locationId);
	const {
		workerQuery,
		positionFilter,
		staffStateFilter,
		groupFilter,
		tagFilter,
		timeBlockFilter,
	} = filters;

	const groupRows = groups.data?.groups;
	const tagRows = tags.data?.tags;
	const timeBlockRows = timeBlocks.data?.timeBlocks;

	const positionItems = useMemo(
		() => [
			{ label: "All positions", value: "all" },
			...(positions ?? []).map((position) => ({
				label: position.name,
				value: position.id,
			})),
		],
		[positions],
	);
	const groupItems = useMemo(
		() => [
			{ label: "All groups", value: "all" },
			...(groupRows ?? []).map((group) => ({
				label: group.name,
				value: group.id,
			})),
		],
		[groupRows],
	);
	const tagItems = useMemo(
		() => [
			{ label: "All tags", value: "all" },
			...(tagRows ?? []).map((tag) => ({ label: tag.name, value: tag.id })),
		],
		[tagRows],
	);
	const timeBlockItems = useMemo(
		() => [
			{ label: "All time blocks", value: "all" },
			...(timeBlockRows ?? []).map((part) => ({
				label: part.name,
				value: part.id,
			})),
		],
		[timeBlockRows],
	);

	const hasStaffFilters =
		workerQuery.trim().length > 0 ||
		positionFilter !== "all" ||
		staffStateFilter !== "all" ||
		groupFilter !== "all" ||
		tagFilter !== "all" ||
		timeBlockFilter !== "all";
	const activeSelectFilterCount =
		Number(positionFilter !== "all") +
		Number(staffStateFilter !== "all") +
		Number(groupFilter !== "all") +
		Number(tagFilter !== "all") +
		Number(timeBlockFilter !== "all");

	const handleQuery = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onFilterChange("workerQuery", event.target.value),
		[onFilterChange],
	);
	const handlePosition = useCallback(
		(value: string | null) => {
			if (value) onFilterChange("positionFilter", value);
		},
		[onFilterChange],
	);
	const handleState = useCallback(
		(value: string | null) => {
			if (value) onFilterChange("staffStateFilter", value);
		},
		[onFilterChange],
	);
	const handleGroup = useCallback(
		(value: string | null) => {
			if (value) onFilterChange("groupFilter", value);
		},
		[onFilterChange],
	);
	const handleTag = useCallback(
		(value: string | null) => {
			if (value) onFilterChange("tagFilter", value);
		},
		[onFilterChange],
	);
	const handleTimeBlock = useCallback(
		(value: string | null) => {
			if (value) onFilterChange("timeBlockFilter", value);
		},
		[onFilterChange],
	);
	const densityValue = useMemo(() => [density], [density]);
	const handleDensity = useCallback(
		(value: string[]) => {
			const next = value[0];
			if (next === "compact" || next === "comfortable") onDensityChange(next);
		},
		[onDensityChange],
	);

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2 border-b bg-background px-3 py-1.5 print:hidden">
			{hasData && hasStaff ? (
				<>
					<InputGroup className="min-w-36 max-w-52 flex-1 sm:flex-none">
						<InputGroupAddon align="inline-start">
							<SearchIcon />
						</InputGroupAddon>
						<InputGroupInput
							aria-label="Search workers"
							placeholder="Search"
							value={workerQuery}
							onChange={handleQuery}
						/>
					</InputGroup>
					<Popover>
						<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
							<ListFilterIcon data-icon="inline-start" />
							Filters
							{activeSelectFilterCount > 0 ? (
								<Badge
									variant="secondary"
									className="ml-1 size-5 px-0 tabular-nums"
								>
									{activeSelectFilterCount}
								</Badge>
							) : null}
						</PopoverTrigger>
						<PopoverContent align="start" className="w-72">
							<PopoverHeader>
								<PopoverTitle>Filters</PopoverTitle>
							</PopoverHeader>
							<FieldGroup className="gap-3">
								<Field>
									<FieldLabel>Position</FieldLabel>
									<Select
										items={positionItems}
										value={positionFilter}
										onValueChange={handlePosition}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent alignItemWithTrigger={false}>
											<SelectGroup>
												{positionItems.map((item) => (
													<SelectItem key={item.value} value={item.value}>
														{item.label}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel>Schedule state</FieldLabel>
									<Select
										items={STATE_ITEMS}
										value={staffStateFilter}
										onValueChange={handleState}
									>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent alignItemWithTrigger={false}>
											<SelectGroup>
												{STATE_ITEMS.map((item) => (
													<SelectItem key={item.value} value={item.value}>
														{item.label}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								{(groupRows ?? []).length > 0 ? (
									<Field>
										<FieldLabel>Worker group</FieldLabel>
										<Select
											items={groupItems}
											value={groupFilter}
											onValueChange={handleGroup}
										>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent alignItemWithTrigger={false}>
												<SelectGroup>
													{groupItems.map((item) => (
														<SelectItem key={item.value} value={item.value}>
															{item.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</Field>
								) : null}
								{(tagRows ?? []).length > 0 ? (
									<Field>
										<FieldLabel>Shift tag</FieldLabel>
										<Select
											items={tagItems}
											value={tagFilter}
											onValueChange={handleTag}
										>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent alignItemWithTrigger={false}>
												<SelectGroup>
													{tagItems.map((item) => (
														<SelectItem key={item.value} value={item.value}>
															{item.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</Field>
								) : null}
								{(timeBlockRows ?? []).length > 0 ? (
									<Field>
										<FieldLabel>Time block</FieldLabel>
										<Select
											items={timeBlockItems}
											value={timeBlockFilter}
											onValueChange={handleTimeBlock}
										>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent alignItemWithTrigger={false}>
												<SelectGroup>
													{timeBlockItems.map((item) => (
														<SelectItem key={item.value} value={item.value}>
															{item.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</Field>
								) : null}
								{showDensity ? (
									<Field>
										<FieldLabel>Density</FieldLabel>
										<ToggleGroup
											aria-label="Schedule grid density"
											value={densityValue}
											variant="outline"
											size="sm"
											spacing={0}
											className="w-full"
											onValueChange={handleDensity}
										>
											<ToggleGroupItem className="flex-1" value="compact">
												Compact
											</ToggleGroupItem>
											<ToggleGroupItem className="flex-1" value="comfortable">
												Comfortable
											</ToggleGroupItem>
										</ToggleGroup>
									</Field>
								) : null}
								{(positions ?? []).length > 0 ? (
									<Field>
										<FieldLabel>Position colors</FieldLabel>
										<ul
											className="flex list-none flex-wrap gap-x-3 gap-y-1.5"
											aria-label="Position colors"
										>
											{(positions ?? []).map((position) => (
												<li
													key={position.id}
													className="flex items-center gap-1.5 text-muted-foreground text-xs"
												>
													<span
														className={cn(
															"size-1.5 rounded-full",
															positionColor(position.name).dot,
														)}
														aria-hidden
													/>
													{position.name}
												</li>
											))}
										</ul>
									</Field>
								) : null}
							</FieldGroup>
						</PopoverContent>
					</Popover>
					{hasStaffFilters ? (
						<Button variant="ghost" size="sm" onClick={onClearFilters}>
							<XIcon data-icon="inline-start" />
							Clear
						</Button>
					) : null}
				</>
			) : null}

			{hasData &&
			(openShiftCount > 0 || conflictCount > 0 || onClockCount > 0) ? (
				<div className="ml-auto flex min-w-0 items-center gap-1.5">
					{openShiftCount > 0 ? (
						<ScheduleMetric
							value={openShiftCount}
							label="open"
							tone="emphasis"
						/>
					) : null}
					{conflictCount > 0 ? (
						<ScheduleMetric
							value={conflictCount}
							label={conflictCount === 1 ? "conflict" : "conflicts"}
							tone="danger"
						/>
					) : null}
					{onClockCount > 0 ? (
						<ScheduleMetric
							value={onClockCount}
							label="on clock"
							tone="emphasis"
						/>
					) : null}
				</div>
			) : null}
		</div>
	);
});
