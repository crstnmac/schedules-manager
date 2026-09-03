import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { SettingsSection } from "@/components/settings/page";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import type { LocationDto, PositionDto, WorkerDto } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

type Group = { id: string; name: string; employmentIds: string[] };
type Tag = { id: string; name: string };
type LeaveType = { id: string; name: string; paid: boolean };
type RangeRow = {
	id: string;
	name: string;
	startMinute: number;
	endMinute: number;
};
type TemplateRow = {
	id: string;
	name: string;
	positionId: string;
	startMinute: number;
	endMinute: number;
	note: string | null;
};

const groupHelper = createDataColumnHelper<Group>();
const tagHelper = createDataColumnHelper<Tag>();
const leaveHelper = createDataColumnHelper<LeaveType>();
const rangeHelper = createDataColumnHelper<RangeRow>();
const templateHelper = createDataColumnHelper<TemplateRow>();

export type TimeConfiguration = {
	timeBlocks: RangeRow[];
	dayParts: RangeRow[];
	shiftTemplates: TemplateRow[];
};

function SettingsLocationField({
	locations,
	locationId,
	onLocationChange,
}: {
	locations: LocationDto[];
	locationId: string | undefined;
	onLocationChange: (id: string) => void;
}) {
	if (locations.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Add a location before configuring scheduling helpers.
			</p>
		);
	}

	return (
		<Field className="max-w-sm">
			<FieldLabel htmlFor="settings-location">Location</FieldLabel>
			<Select
				items={locations.map((location) => ({
					label: location.name,
					value: location.id,
				}))}
				value={locationId}
				onValueChange={(value) => value && onLocationChange(value)}
			>
				<SelectTrigger id="settings-location" className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{locations.map((location) => (
							<SelectItem key={location.id} value={location.id}>
								{location.name}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}

export function GroupsCard({
	workplaceId,
	groups,
	workers,
}: {
	workplaceId: string | undefined;
	groups: Group[];
	workers: WorkerDto[];
}) {
	const { formatPerson } = useDisplayPrefs();
	const queryClient = useQueryClient();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [employmentIds, setEmploymentIds] = useState<string[]>([]);
	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/workplaces/${workplaceId}/groups/${editingId}`
					: `/v1/workplaces/${workplaceId}/groups`,
				{
					method: editingId ? "PUT" : "POST",
					body: { name: name.trim(), employmentIds },
				},
			),
		onSuccess: () => {
			setEditingId(null);
			setName("");
			setEmploymentIds([]);
			queryClient.invalidateQueries({ queryKey: ["groups", workplaceId] });
			toast.success("Worker Group saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (groupId: string) =>
			api(`/v1/workplaces/${workplaceId}/groups/${groupId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["groups", workplaceId] });
			toast.success("Worker Group deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function edit(group?: Group) {
		setEditingId(group?.id ?? null);
		setName(group?.name ?? "");
		setEmploymentIds(group?.employmentIds ?? []);
	}

	const columns = useMemo(
		() =>
			groupHelper.columns([
				groupHelper.accessor("name", {
					header: "Group",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				groupHelper.accessor((row) => row.employmentIds.length, {
					id: "members",
					header: "Members",
					cell: ({ getValue }) => {
						const count = getValue();
						return `${count} member${count === 1 ? "" : "s"}`;
					},
				}),
				groupHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => edit(row.original)}
							>
								Edit
							</Button>
							<ConfirmAction
								trigger="Delete"
								triggerVariant="ghost"
								destructive
								title="Delete this group?"
								description="Workers will be removed from the group. Their employment is unchanged."
								confirmLabel="Delete"
								disabled={remove.isPending}
								onConfirm={() => remove.mutate(row.original.id)}
							/>
						</div>
					),
				}),
			]),
		[remove],
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All groups"
				description="Team filters you can use on the schedule."
				count={groups.length}
			>
				<DataTable
					bounded
					columns={columns}
					data={groups}
					getRowId={(row) => row.id}
					empty={
						<p className="text-muted-foreground text-sm">
							No worker groups yet.
						</p>
					}
				/>
			</SettingsSection>

			<SettingsSection
				title={editingId ? "Edit group" : "Add group"}
				description={
					editingId
						? "Update the name and members for this group."
						: "Create a team filter for the schedule."
				}
				footer={
					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							form="group-form"
							disabled={save.isPending || !name.trim()}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Update group" : "Add group"}
						</Button>
						{editingId ? (
							<Button type="button" variant="ghost" onClick={() => edit()}>
								Cancel
							</Button>
						) : null}
					</div>
				}
			>
				<form
					id="group-form"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="group-name">Group name</FieldLabel>
							<Input
								id="group-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Closing team"
								required
							/>
						</Field>
						<div className="grid gap-2 sm:grid-cols-2">
							{workers
								.filter((worker) => worker.status === "active")
								.map((worker) => (
									<Field
										key={worker.employmentId}
										orientation="horizontal"
										className="items-center"
									>
										<Checkbox
											id={`group-worker-${worker.employmentId}`}
											checked={employmentIds.includes(worker.employmentId)}
											onCheckedChange={() =>
												setEmploymentIds((current) =>
													current.includes(worker.employmentId)
														? current.filter((id) => id !== worker.employmentId)
														: [...current, worker.employmentId],
												)
											}
										/>
										<FieldLabel
											htmlFor={`group-worker-${worker.employmentId}`}
											className="font-normal"
										>
											{formatPerson(worker.profile.fullName, worker.profile.email)}
										</FieldLabel>
									</Field>
								))}
						</div>
					</FieldGroup>
				</form>
			</SettingsSection>
		</div>
	);
}

export function TagsCard({
	workplaceId,
	tags,
}: {
	workplaceId: string | undefined;
	tags: Tag[];
}) {
	const queryClient = useQueryClient();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [tagName, setTagName] = useState("");
	function edit(tag?: Tag) {
		setEditingId(tag?.id ?? null);
		setTagName(tag?.name ?? "");
	}
	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/workplaces/${workplaceId}/tags/${editingId}`
					: `/v1/workplaces/${workplaceId}/tags`,
				{
					method: editingId ? "PATCH" : "POST",
					body: { name: tagName.trim() },
				},
			),
		onSuccess: () => {
			edit();
			queryClient.invalidateQueries({ queryKey: ["tags", workplaceId] });
			toast.success("Shift Tag saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (tagId: string) =>
			api(`/v1/workplaces/${workplaceId}/tags/${tagId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tags", workplaceId] });
			toast.success("Shift Tag deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const columns = useMemo(
		() =>
			tagHelper.columns([
				tagHelper.accessor("name", {
					header: "Tag",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				tagHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => edit(row.original)}
							>
								Edit
							</Button>
							<ConfirmAction
								trigger="Delete"
								triggerVariant="ghost"
								destructive
								title="Delete this tag?"
								description="Shifts using this tag will lose the label."
								confirmLabel="Delete"
								disabled={remove.isPending}
								onConfirm={() => remove.mutate(row.original.id)}
							/>
						</div>
					),
				}),
			]),
		[remove],
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All tags"
				description="Labels that can appear on a shift tile."
				count={tags.length}
			>
				<DataTable
					bounded
					columns={columns}
					data={tags}
					getRowId={(row) => row.id}
					empty={
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No shift tags yet</EmptyTitle>
								<EmptyDescription>
									Add a short label below to use on shift tiles.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					}
				/>
			</SettingsSection>

			<SettingsSection
				title={editingId ? "Edit tag" : "Add tag"}
				description="Keep names short — they show on shift tiles."
				footer={
					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							form="tag-form"
							disabled={!tagName.trim() || save.isPending}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Update tag" : "Add tag"}
						</Button>
						{editingId ? (
							<Button type="button" variant="ghost" onClick={() => edit()}>
								Cancel
							</Button>
						) : null}
					</div>
				}
			>
				<form
					id="tag-form"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<Field>
						<FieldLabel htmlFor="tag-name">Tag name</FieldLabel>
						<Input
							id="tag-name"
							value={tagName}
							onChange={(event) => setTagName(event.target.value)}
							placeholder="Training"
						/>
					</Field>
				</form>
			</SettingsSection>
		</div>
	);
}

export function LeaveTypesCard({
	workplaceId,
	leaveTypes,
}: {
	workplaceId: string | undefined;
	leaveTypes: LeaveType[];
}) {
	const queryClient = useQueryClient();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [leaveName, setLeaveName] = useState("");
	const [paid, setPaid] = useState(false);
	function edit(leaveType?: LeaveType) {
		setEditingId(leaveType?.id ?? null);
		setLeaveName(leaveType?.name ?? "");
		setPaid(leaveType?.paid ?? false);
	}
	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/workplaces/${workplaceId}/leave-types/${editingId}`
					: `/v1/workplaces/${workplaceId}/leave-types`,
				{
					method: editingId ? "PATCH" : "POST",
					body: { name: leaveName.trim(), paid },
				},
			),
		onSuccess: () => {
			edit();
			queryClient.invalidateQueries({
				queryKey: ["leave-types", workplaceId],
			});
			toast.success("Leave Type saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (leaveTypeId: string) =>
			api(`/v1/workplaces/${workplaceId}/leave-types/${leaveTypeId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-types", workplaceId],
			});
			toast.success("Leave Type deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const columns = useMemo(
		() =>
			leaveHelper.columns([
				leaveHelper.accessor("name", {
					header: "Leave type",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				leaveHelper.accessor("paid", {
					header: "Pay",
					cell: ({ getValue }) => (getValue() ? "Paid" : "Unpaid"),
				}),
				leaveHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => edit(row.original)}
							>
								Edit
							</Button>
							<ConfirmAction
								trigger="Delete"
								triggerVariant="ghost"
								destructive
								title="Delete this leave type?"
								description="PTO balances for this type will be removed. Existing time-off requests keep their dates."
								confirmLabel="Delete"
								disabled={remove.isPending}
								onConfirm={() => remove.mutate(row.original.id)}
							/>
						</div>
					),
				}),
			]),
		[remove],
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All leave types"
				description="Request rules live under Time off. These are the categories people pick."
				count={leaveTypes.length}
			>
				<DataTable
					bounded
					columns={columns}
					data={leaveTypes}
					getRowId={(row) => row.id}
					empty={
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No leave types yet</EmptyTitle>
								<EmptyDescription>
									Add the reasons people can request time off.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					}
				/>
			</SettingsSection>

			<SettingsSection
				title={editingId ? "Edit leave type" : "Add leave type"}
				description={
					editingId
						? "Rename this type or change whether it deducts paid hours."
						: "Paid types deduct remaining hours when a request is approved."
				}
				footer={
					<div className="flex flex-wrap gap-2">
						<Button
							type="submit"
							form="leave-form"
							disabled={!leaveName.trim() || save.isPending}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Update leave type" : "Add leave type"}
						</Button>
						{editingId ? (
							<Button type="button" variant="ghost" onClick={() => edit()}>
								Cancel
							</Button>
						) : null}
					</div>
				}
			>
				<form
					id="leave-form"
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<Field>
						<FieldLabel htmlFor="leave-name">Leave type name</FieldLabel>
						<Input
							id="leave-name"
							value={leaveName}
							onChange={(event) => setLeaveName(event.target.value)}
							placeholder="Vacation"
						/>
					</Field>
					<Field orientation="horizontal" className="items-center">
						<Checkbox
							id="leave-paid"
							checked={paid}
							onCheckedChange={(checked) => setPaid(checked === true)}
						/>
						<FieldLabel htmlFor="leave-paid" className="font-normal">
							Paid leave type
						</FieldLabel>
					</Field>
				</form>
			</SettingsSection>
		</div>
	);
}

function RangeSection({
	kind,
	label,
	emptyLabel,
	rows,
	locationId,
	locations,
	onLocationChange,
	isLoading,
}: {
	kind: "time-blocks" | "day-parts";
	label: string;
	emptyLabel: string;
	rows: RangeRow[];
	locationId: string | undefined;
	locations: LocationDto[];
	onLocationChange: (id: string) => void;
	isLoading: boolean;
}) {
	const { formatMinute } = useDisplayPrefs();
	const queryClient = useQueryClient();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [startMinute, setStartMinute] = useState(9 * 60);
	const [endMinute, setEndMinute] = useState(17 * 60);
	function edit(row?: RangeRow) {
		setEditingId(row?.id ?? null);
		setName(row?.name ?? "");
		setStartMinute(row?.startMinute ?? 9 * 60);
		setEndMinute(row?.endMinute ?? 17 * 60);
	}
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["time-blocks", locationId] });
	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/locations/${locationId}/${kind}/${editingId}`
					: `/v1/locations/${locationId}/${kind}`,
				{
					method: editingId ? "PATCH" : "POST",
					body: { name: name.trim(), startMinute, endMinute },
				},
			),
		onSuccess: () => {
			edit();
			invalidate();
			toast.success(`${label} saved.`);
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/locations/${locationId}/${kind}/${id}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidate();
			toast.success(`${label} deleted.`);
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const columns = useMemo(
		() =>
			rangeHelper.columns([
				rangeHelper.accessor("name", {
					header: "Name",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				rangeHelper.accessor(
					(row) =>
						`${formatMinute(row.startMinute)}–${formatMinute(row.endMinute)}`,
					{
						id: "window",
						header: "Window",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
				rangeHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => edit(row.original)}
							>
								Edit
							</Button>
							<ConfirmAction
								trigger="Delete"
								triggerVariant="ghost"
								destructive
								title={`Delete this ${label.toLowerCase()}?`}
								description={`This ${label.toLowerCase()} will be removed from the location.`}
								confirmLabel="Delete"
								disabled={remove.isPending}
								onConfirm={() => remove.mutate(row.original.id)}
							/>
						</div>
					),
				}),
			]),
		[formatMinute, label, remove],
	);

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title={label === "Time Block" ? "All time blocks" : "All day parts"}
				description={
					label === "Time Block"
						? "Windows you can drop onto the week while building a schedule."
						: "Parts of service for this location, such as breakfast or dinner."
				}
				count={rows.length}
			>
				<div className="flex flex-col gap-4">
					<SettingsLocationField
						locations={locations}
						locationId={locationId}
						onLocationChange={(id) => {
							edit();
							onLocationChange(id);
						}}
					/>
					{!locationId ? null : isLoading ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : (
						<DataTable
							bounded
							columns={columns}
							data={rows}
							getRowId={(row) => row.id}
							empty={
								<p className="text-muted-foreground text-sm">{emptyLabel}</p>
							}
						/>
					)}
				</div>
			</SettingsSection>

			{locationId ? (
				<SettingsSection
					title={
						editingId
							? `Edit ${label.toLowerCase()}`
							: `Add ${label.toLowerCase()}`
					}
					description={
						editingId
							? `Update the name or hours for this ${label.toLowerCase()}.`
							: `Give this ${label.toLowerCase()} a name and a start and end time.`
					}
					footer={
						<div className="flex flex-wrap gap-2">
							<Button
								type="submit"
								form={`${kind}-form`}
								disabled={!name.trim() || save.isPending}
							>
								{save.isPending ? <Spinner data-icon="inline-start" /> : null}
								{editingId
									? `Update ${label.toLowerCase()}`
									: `Add ${label.toLowerCase()}`}
							</Button>
							{editingId ? (
								<Button type="button" variant="ghost" onClick={() => edit()}>
									Cancel
								</Button>
							) : null}
						</div>
					}
				>
					<form
						id={`${kind}-form`}
						onSubmit={(event) => {
							event.preventDefault();
							save.mutate();
						}}
					>
						<FieldGroup className="grid gap-4 sm:grid-cols-2">
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor={`${kind}-name`}>Name</FieldLabel>
								<Input
									id={`${kind}-name`}
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder={kind === "day-parts" ? "Evening" : "Mid shift"}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${kind}-start`}>Starts</FieldLabel>
								<TimePicker
									id={`${kind}-start`}
									value={startMinute}
									onValueChange={setStartMinute}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${kind}-end`}>Ends</FieldLabel>
								<TimePicker
									id={`${kind}-end`}
									value={endMinute}
									onValueChange={setEndMinute}
								/>
							</Field>
						</FieldGroup>
					</form>
				</SettingsSection>
			) : null}
		</div>
	);
}

export function TimeBlocksCard({
	locations,
	locationId,
	onLocationChange,
	data,
	isLoading,
}: {
	locations: LocationDto[];
	locationId: string | undefined;
	onLocationChange: (id: string) => void;
	data: TimeConfiguration | undefined;
	isLoading: boolean;
}) {
	return (
		<RangeSection
			kind="time-blocks"
			label="Time Block"
			emptyLabel="No time blocks yet."
			rows={data?.timeBlocks ?? []}
			locationId={locationId}
			locations={locations}
			onLocationChange={onLocationChange}
			isLoading={isLoading}
		/>
	);
}

export function DayPartsCard({
	locations,
	locationId,
	onLocationChange,
	data,
	isLoading,
}: {
	locations: LocationDto[];
	locationId: string | undefined;
	onLocationChange: (id: string) => void;
	data: TimeConfiguration | undefined;
	isLoading: boolean;
}) {
	return (
		<RangeSection
			kind="day-parts"
			label="Day Part"
			emptyLabel="No day parts yet."
			rows={data?.dayParts ?? []}
			locationId={locationId}
			locations={locations}
			onLocationChange={onLocationChange}
			isLoading={isLoading}
		/>
	);
}

export function TemplatesCard({
	locations,
	locationId,
	onLocationChange,
	positions,
	data,
	isLoading,
}: {
	locations: LocationDto[];
	locationId: string | undefined;
	onLocationChange: (id: string) => void;
	positions: PositionDto[];
	data: TimeConfiguration | undefined;
	isLoading: boolean;
}) {
	const { formatMinute } = useDisplayPrefs();
	const queryClient = useQueryClient();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [templateName, setTemplateName] = useState("");
	const [positionId, setPositionId] = useState("");
	const [templateStart, setTemplateStart] = useState(9 * 60);
	const [templateEnd, setTemplateEnd] = useState(17 * 60);
	const [note, setNote] = useState("");
	function edit(template?: TemplateRow) {
		setEditingId(template?.id ?? null);
		setTemplateName(template?.name ?? "");
		setPositionId(template?.positionId ?? "");
		setTemplateStart(template?.startMinute ?? 9 * 60);
		setTemplateEnd(template?.endMinute ?? 17 * 60);
		setNote(template?.note ?? "");
	}
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["time-blocks", locationId] });
	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/locations/${locationId}/shift-templates/${editingId}`
					: `/v1/locations/${locationId}/shift-templates`,
				{
					method: editingId ? "PATCH" : "POST",
					body: {
						name: templateName.trim(),
						positionId,
						startMinute: templateStart,
						endMinute: templateEnd,
						note: note.trim() || undefined,
					},
				},
			),
		onSuccess: () => {
			edit();
			invalidate();
			toast.success("Shift Template saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (templateId: string) =>
			api(`/v1/locations/${locationId}/shift-templates/${templateId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Shift Template deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const columns = useMemo(
		() =>
			templateHelper.columns([
				templateHelper.accessor("name", {
					header: "Template",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				templateHelper.accessor(
					(row) =>
						`${formatMinute(row.startMinute)}–${formatMinute(row.endMinute)}`,
					{
						id: "window",
						header: "Window",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
				templateHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => edit(row.original)}
							>
								Edit
							</Button>
							<ConfirmAction
								trigger="Delete"
								triggerVariant="ghost"
								destructive
								title="Delete this template?"
								description="This template will be removed from the location."
								confirmLabel="Delete"
								disabled={remove.isPending}
								onConfirm={() => remove.mutate(row.original.id)}
							/>
						</div>
					),
				}),
			]),
		[formatMinute, remove],
	);

	const templates = data?.shiftTemplates ?? [];

	return (
		<div className="flex flex-col gap-6">
			<SettingsSection
				title="All templates"
				count={templates.length}
				description="Reusable shift shapes for a position at this location."
			>
				<div className="flex flex-col gap-4">
					<SettingsLocationField
						locations={locations}
						locationId={locationId}
						onLocationChange={(id) => {
							edit();
							onLocationChange(id);
						}}
					/>
					{!locationId ? null : isLoading ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : (
						<DataTable
							bounded
							columns={columns}
							data={templates}
							getRowId={(row) => row.id}
							empty={
								<p className="text-muted-foreground text-sm">
									No shift templates yet.
								</p>
							}
						/>
					)}
				</div>
			</SettingsSection>

			{locationId ? (
				<SettingsSection
					title={editingId ? "Edit template" : "Add template"}
					description={
						editingId
							? "Update the position, hours, or note for this template."
							: "Save a position and time window you reuse often."
					}
					footer={
						<div className="flex flex-wrap gap-2">
							<Button
								type="submit"
								form="template-form"
								disabled={!templateName.trim() || !positionId || save.isPending}
							>
								{save.isPending ? <Spinner data-icon="inline-start" /> : null}
								{editingId ? "Update template" : "Add template"}
							</Button>
							{editingId ? (
								<Button type="button" variant="ghost" onClick={() => edit()}>
									Cancel
								</Button>
							) : null}
						</div>
					}
				>
					<form
						id="template-form"
						onSubmit={(event) => {
							event.preventDefault();
							save.mutate();
						}}
					>
						<FieldGroup className="grid gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="template-name">Name</FieldLabel>
								<Input
									id="template-name"
									value={templateName}
									onChange={(event) => setTemplateName(event.target.value)}
									placeholder="Opening associate"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="template-position">Position</FieldLabel>
								<Select
									items={positions.map((position) => ({
										label: position.name,
										value: position.id,
									}))}
									value={positionId}
									onValueChange={(value) => value && setPositionId(value)}
								>
									<SelectTrigger id="template-position" className="w-full">
										<SelectValue placeholder="Choose a position" />
									</SelectTrigger>
									<SelectContent>
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
								<FieldLabel htmlFor="template-start">Starts</FieldLabel>
								<TimePicker
									id="template-start"
									value={templateStart}
									onValueChange={setTemplateStart}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="template-end">Ends</FieldLabel>
								<TimePicker
									id="template-end"
									value={templateEnd}
									onValueChange={setTemplateEnd}
								/>
							</Field>
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor="template-note">Note (optional)</FieldLabel>
								<Textarea
									id="template-note"
									value={note}
									onChange={(event) => setNote(event.target.value)}
								/>
							</Field>
						</FieldGroup>
					</form>
				</SettingsSection>
			) : null}
		</div>
	);
}
