import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, RepeatIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import type { LocationDto, PositionDto, WorkerDto } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

export interface ShiftPatternListItem {
	id: string;
	name: string;
	description: string | null;
	locationId: string | null;
	cycleWeeks: number;
	shiftCount: number;
	memberCount: number;
	updatedAt: string;
}

interface ShiftPatternDetail {
	id: string;
	locationId: string | null;
	name: string;
	description: string | null;
	cycleWeeks: number;
	shifts: {
		id: string;
		weekIndex: number;
		weekdayOffset: number;
		positionId: string;
		startMinute: number;
		endMinute: number;
		overnight: boolean;
		coverageTarget: number;
		note: string | null;
	}[];
	memberIds: string[];
}

type ShiftDraft = {
	key: string;
	weekIndex: number;
	weekdayOffset: number;
	positionId: string;
	startMinute: number;
	endMinute: number;
	coverageTarget: number;
	note: string;
};

const patternHelper = createDataColumnHelper<ShiftPatternListItem>();
const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
const ANY_LOCATION = "__any_location__";
const CYCLE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const WEEKDAY_LABELS = [
	"Day 1",
	"Day 2",
	"Day 3",
	"Day 4",
	"Day 5",
	"Day 6",
	"Day 7",
];

function useShiftPatterns(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["shift-patterns", workplaceId],
		queryFn: () =>
			api<{ patterns: ShiftPatternListItem[] }>(
				`/v1/workplaces/${workplaceId}/shift-patterns`,
			).then((data) => data.patterns),
		enabled: Boolean(workplaceId),
	});
}

function emptyShift(): ShiftDraft {
	return {
		key: crypto.randomUUID(),
		weekIndex: 0,
		weekdayOffset: 0,
		positionId: "",
		startMinute: 9 * 60,
		endMinute: 17 * 60,
		coverageTarget: 1,
		note: "",
	};
}

export function PatternsCard({
	workplaceId,
	locations,
	positions,
	workers,
}: {
	workplaceId: string | undefined;
	locations: LocationDto[];
	positions: PositionDto[];
	workers: WorkerDto[];
}) {
	const { formatPerson } = useDisplayPrefs();
	const queryClient = useQueryClient();
	const patterns = useShiftPatterns(workplaceId);

	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [cycleWeeks, setCycleWeeks] = useState(2);
	const [locationId, setLocationId] = useState(ANY_LOCATION);
	const [memberIds, setMemberIds] = useState<string[]>([]);
	const [memberSearch, setMemberSearch] = useState("");
	const [shifts, setShifts] = useState<ShiftDraft[]>([]);

	const activeWorkers = useMemo(
		() => workers.filter((worker) => worker.status === "active"),
		[workers],
	);
	const visibleWorkers = useMemo(() => {
		const term = memberSearch.trim().toLowerCase();
		if (!term) return activeWorkers;
		return activeWorkers.filter((worker) =>
			formatPerson(worker.profile.fullName, worker.profile.email)
				.toLowerCase()
				.includes(term),
		);
	}, [activeWorkers, formatPerson, memberSearch]);

	const locationName = useCallback(
		(id: string | null) =>
			id ? (locations.find((location) => location.id === id)?.name ?? "") : "",
		[locations],
	);

	const weekOptions = useMemo(
		() => Array.from({ length: cycleWeeks }, (_, index) => index),
		[cycleWeeks],
	);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setDescription("");
		setCycleWeeks(2);
		setLocationId(ANY_LOCATION);
		setMemberIds([]);
		setMemberSearch("");
		setShifts([]);
	}, []);

	const loadDetail = useMutation({
		mutationFn: (patternId: string) =>
			api<{ pattern: ShiftPatternDetail }>(
				`/v1/workplaces/${workplaceId}/shift-patterns/${patternId}`,
			),
		onSuccess: ({ pattern }) => {
			setEditingId(pattern.id);
			setName(pattern.name);
			setDescription(pattern.description ?? "");
			setCycleWeeks(pattern.cycleWeeks);
			setLocationId(pattern.locationId ?? ANY_LOCATION);
			setMemberIds(pattern.memberIds);
			setMemberSearch("");
			setShifts(
				pattern.shifts.map((shift) => ({
					key: crypto.randomUUID(),
					weekIndex: shift.weekIndex,
					weekdayOffset: shift.weekdayOffset,
					positionId: shift.positionId,
					startMinute: shift.startMinute,
					endMinute: shift.endMinute,
					coverageTarget: shift.coverageTarget,
					note: shift.note ?? "",
				})),
			);
			setOpen(true);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/workplaces/${workplaceId}/shift-patterns/${editingId}`
					: `/v1/workplaces/${workplaceId}/shift-patterns`,
				{
					method: editingId ? "PUT" : "POST",
					body: {
						name: name.trim(),
						description: description.trim() || null,
						locationId: locationId === ANY_LOCATION ? null : locationId,
						cycleWeeks,
						shifts: shifts.map((shift) => ({
							weekIndex: shift.weekIndex,
							weekdayOffset: shift.weekdayOffset,
							positionId: shift.positionId,
							startMinute: shift.startMinute,
							endMinute: shift.endMinute,
							overnight: shift.endMinute <= shift.startMinute,
							coverageTarget: shift.coverageTarget,
							note: shift.note.trim() || null,
						})),
						memberIds,
					},
				},
			),
		onSuccess: () => {
			resetForm();
			setOpen(false);
			queryClient.invalidateQueries({
				queryKey: ["shift-patterns", workplaceId],
			});
			toast.success("Shift Pattern saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (patternId: string) =>
			api(`/v1/workplaces/${workplaceId}/shift-patterns/${patternId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["shift-patterns", workplaceId],
			});
			toast.success("Shift Pattern deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const startAdd = () => {
		resetForm();
		setShifts([emptyShift()]);
		setOpen(true);
	};
	const startEdit = (pattern: ShiftPatternListItem) => {
		resetForm();
		loadDetail.mutate(pattern.id);
	};

	const changeCycle = (value: string | null) => {
		if (value == null) return;
		const next = Number(value);
		if (!Number.isFinite(next)) return;
		setCycleWeeks(next);
		setShifts((current) =>
			current.map((shift) =>
				shift.weekIndex >= next ? { ...shift, weekIndex: 0 } : shift,
			),
		);
	};

	const updateShift = (key: string, patch: Partial<ShiftDraft>) =>
		setShifts((current) =>
			current.map((shift) =>
				shift.key === key ? { ...shift, ...patch } : shift,
			),
		);

	const shiftsValid =
		shifts.length > 0 &&
		shifts.every(
			(shift) =>
				shift.positionId &&
				shift.weekIndex < cycleWeeks &&
				shift.startMinute !== shift.endMinute &&
				shift.coverageTarget >= 1,
		);

	const columns = useMemo(
		() =>
			patternHelper.columns([
				patternHelper.accessor("name", {
					header: "Pattern",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				patternHelper.accessor((row) => row.cycleWeeks, {
					id: "cycle",
					header: "Cycle",
					cell: ({ getValue }) => `${getValue()} week cycle`,
				}),
				patternHelper.accessor((row) => locationName(row.locationId), {
					id: "location",
					header: "Location",
					cell: ({ getValue }) => getValue() || "Any location",
				}),
				patternHelper.accessor((row) => row.shiftCount, {
					id: "shifts",
					header: "Shifts",
					cell: ({ getValue }) => `${getValue()}`,
				}),
				patternHelper.accessor((row) => row.memberCount, {
					id: "members",
					header: "Members",
					cell: ({ getValue }) => `${getValue()}`,
				}),
			]),
		[locationName],
	);

	const rows = patterns.data ?? [];

	return (
		<>
			<SettingsCrudCard
				title="Shift Patterns"
				description="Reusable multi-week rotations you can project onto future drafts."
				count={rows.length}
				data={rows}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) =>
					`${row.name} ${row.description ?? ""} ${locationName(row.locationId)}`
				}
				searchPlaceholder="Search shift patterns"
				entityLabel="shift pattern"
				isLoading={Boolean(workplaceId) && patterns.isLoading}
				emptyIcon={<RepeatIcon />}
				emptyTitle="No shift patterns yet"
				emptyDescription="Build a rotation once, then apply it across several weeks."
				addLabel="Add pattern"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this shift pattern?",
					deleteDescription:
						"Any weeks already applied from this pattern are left untouched.",
					deleteDisabled: remove.isPending || loadDetail.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				className="w-full sm:max-w-2xl"
				title={editingId ? "Edit shift pattern" : "Add shift pattern"}
				description={
					editingId
						? "Update the rotation, its shifts, and its members."
						: "Define a multi-week rotation and who works it."
				}
				footer={
					<div className={sheetFooterClassName}>
						<Button
							variant="outline"
							onClick={() => {
								setOpen(false);
								resetForm();
							}}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							form="pattern-form"
							disabled={
								!name.trim() ||
								shifts.length === 0 ||
								!shiftsValid ||
								save.isPending
							}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save pattern" : "Add pattern"}
						</Button>
					</div>
				}
			>
				<form
					id="pattern-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="pattern-name">Name</FieldLabel>
							<Input
								id="pattern-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Two-week rotation"
								autoFocus
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="pattern-description">
								Description (optional)
							</FieldLabel>
							<Textarea
								id="pattern-description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</Field>
						<FieldGroup className="grid gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="pattern-cycle">Cycle length</FieldLabel>
								<Select
									items={CYCLE_OPTIONS.map((count) => ({
										label: `${count} week${count === 1 ? "" : "s"}`,
										value: String(count),
									}))}
									value={String(cycleWeeks)}
									onValueChange={changeCycle}
								>
									<SelectTrigger id="pattern-cycle" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											{CYCLE_OPTIONS.map((count) => (
												<SelectItem key={count} value={String(count)}>
													{count} week{count === 1 ? "" : "s"}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="pattern-location">
									Location (optional)
								</FieldLabel>
								<Select
									items={[
										{ label: "Any location", value: ANY_LOCATION },
										...locations.map((location) => ({
											label: location.name,
											value: location.id,
										})),
									]}
									value={locationId}
									onValueChange={(value) =>
										setLocationId(value ?? ANY_LOCATION)
									}
								>
									<SelectTrigger id="pattern-location" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											<SelectItem value={ANY_LOCATION}>Any location</SelectItem>
											{locations.map((location) => (
												<SelectItem key={location.id} value={location.id}>
													{location.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						</FieldGroup>
					</FieldGroup>

					<Field>
						<FieldTitle>Shifts</FieldTitle>
						<div className="flex flex-col gap-3">
							{shifts.map((shift, index) => (
								<div
									key={shift.key}
									className="flex flex-col gap-3 rounded-lg border p-3"
								>
									<div className="flex items-center justify-between">
										<span className="font-medium text-muted-foreground text-xs">
											Shift {index + 1}
										</span>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											onClick={() =>
												setShifts((current) =>
													current.filter((row) => row.key !== shift.key),
												)
											}
										>
											<Trash2Icon />
											<span className="sr-only">Remove shift</span>
										</Button>
									</div>
									<div className="grid gap-3 sm:grid-cols-2">
										<Field>
											<FieldLabel htmlFor={`shift-week-${shift.key}`}>
												Cycle week
											</FieldLabel>
											<Select
												items={weekOptions.map((week) => ({
													label: `Week ${week + 1}`,
													value: String(week),
												}))}
												value={String(shift.weekIndex)}
												onValueChange={(value) =>
													value != null &&
													updateShift(shift.key, {
														weekIndex: Number(value),
													})
												}
											>
												<SelectTrigger
													id={`shift-week-${shift.key}`}
													className="w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													<SelectGroup>
														{weekOptions.map((week) => (
															<SelectItem key={week} value={String(week)}>
																Week {week + 1}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</Field>
										<Field>
											<FieldLabel htmlFor={`shift-day-${shift.key}`}>
												Day of week
											</FieldLabel>
											<Select
												items={WEEKDAY_LABELS.map((label, day) => ({
													label,
													value: String(day),
												}))}
												value={String(shift.weekdayOffset)}
												onValueChange={(value) =>
													value != null &&
													updateShift(shift.key, {
														weekdayOffset: Number(value),
													})
												}
											>
												<SelectTrigger
													id={`shift-day-${shift.key}`}
													className="w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													<SelectGroup>
														{WEEKDAY_LABELS.map((label, day) => (
															<SelectItem key={label} value={String(day)}>
																{label}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</Field>
										<Field className="sm:col-span-2">
											<FieldLabel htmlFor={`shift-position-${shift.key}`}>
												Position
											</FieldLabel>
											<Select
												items={positions.map((position) => ({
													label: position.name,
													value: position.id,
												}))}
												value={shift.positionId}
												onValueChange={(value) =>
													value != null &&
													updateShift(shift.key, { positionId: value })
												}
											>
												<SelectTrigger
													id={`shift-position-${shift.key}`}
													className="w-full"
												>
													<SelectValue placeholder="Choose a position" />
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													<SelectGroup>
														{positions.map((position) => (
															<SelectItem key={position.id} value={position.id}>
																{position.name}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</Field>
										<Field>
											<FieldLabel htmlFor={`shift-start-${shift.key}`}>
												Starts
											</FieldLabel>
											<TimePicker
												id={`shift-start-${shift.key}`}
												value={shift.startMinute}
												onValueChange={(minute) =>
													updateShift(shift.key, { startMinute: minute })
												}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor={`shift-end-${shift.key}`}>
												Ends
											</FieldLabel>
											<TimePicker
												id={`shift-end-${shift.key}`}
												value={shift.endMinute}
												onValueChange={(minute) =>
													updateShift(shift.key, { endMinute: minute })
												}
												overnightAfterMinute={shift.startMinute}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor={`shift-coverage-${shift.key}`}>
												Coverage
											</FieldLabel>
											<Input
												id={`shift-coverage-${shift.key}`}
												type="number"
												min={1}
												max={50}
												value={shift.coverageTarget}
												onChange={(event) =>
													updateShift(shift.key, {
														coverageTarget: Math.max(
															1,
															Number(event.target.value) || 1,
														),
													})
												}
											/>
										</Field>
										<Field className="sm:col-span-2">
											<FieldLabel htmlFor={`shift-note-${shift.key}`}>
												Note (optional)
											</FieldLabel>
											<Input
												id={`shift-note-${shift.key}`}
												value={shift.note}
												onChange={(event) =>
													updateShift(shift.key, { note: event.target.value })
												}
											/>
										</Field>
									</div>
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									setShifts((current) => [...current, emptyShift()])
								}
							>
								<PlusIcon data-icon="inline-start" />
								Add shift
							</Button>
						</div>
					</Field>

					<Field>
						<FieldTitle>Members</FieldTitle>
						<p className="text-muted-foreground text-xs">
							Members rotate in the order selected here.
						</p>
						<div className="flex flex-col gap-2">
							<InputGroup className="max-w-xs">
								<InputGroupAddon>
									<SearchIcon />
								</InputGroupAddon>
								<InputGroupInput
									type="search"
									value={memberSearch}
									onChange={(event) => setMemberSearch(event.target.value)}
									placeholder="Search people"
									aria-label="Search people"
								/>
							</InputGroup>
							<div className="max-h-56 overflow-y-auto rounded-lg border p-1">
								{visibleWorkers.length === 0 ? (
									<p className="px-2 py-3 text-muted-foreground text-xs">
										No people match.
									</p>
								) : (
									visibleWorkers.map((worker) => (
										<Field
											key={worker.employmentId}
											orientation="horizontal"
											className="items-center rounded-md px-2 py-1.5 hover:bg-muted/50"
										>
											<Checkbox
												id={`pattern-worker-${worker.employmentId}`}
												checked={memberIds.includes(worker.employmentId)}
												onCheckedChange={() =>
													setMemberIds((current) =>
														current.includes(worker.employmentId)
															? current.filter(
																	(id) => id !== worker.employmentId,
																)
															: [...current, worker.employmentId],
													)
												}
											/>
											<FieldLabel
												htmlFor={`pattern-worker-${worker.employmentId}`}
												className="font-normal"
											>
												{formatPerson(
													worker.profile.fullName,
													worker.profile.email,
												)}
											</FieldLabel>
										</Field>
									))
								)}
							</div>
						</div>
					</Field>
				</form>
			</SettingsFormSheet>
		</>
	);
}
