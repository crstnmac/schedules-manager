import { Badge } from "@SchedulesManager/ui/components/badge";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	CalendarOffIcon,
	ClockIcon,
	LayoutTemplateIcon,
	SearchIcon,
	SunIcon,
	TagsIcon,
	UsersIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import { LeavePolicySheet } from "@/components/settings/leave-policies-card";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import {
	type LeaveTypeDto,
	type LocationDto,
	type PositionDto,
	useApprovalChains,
	type WorkerDto,
} from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

type Group = { id: string; name: string; employmentIds: string[] };
type Tag = { id: string; name: string };
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
const leaveHelper = createDataColumnHelper<LeaveTypeDto>();
const rangeHelper = createDataColumnHelper<RangeRow>();
const templateHelper = createDataColumnHelper<TemplateRow>();

const LEAVE_CLASSIFICATION_ITEMS = [
	{ label: "Standard", value: "standard" },
	{ label: "Floating holiday", value: "floating_holiday" },
	{ label: "Working away", value: "working_away" },
	{ label: "Special", value: "special" },
] as const;

const LEAVE_CLASSIFICATION_LABELS: Record<
	LeaveTypeDto["classification"],
	string
> = {
	standard: "Standard",
	floating_holiday: "Floating holiday",
	working_away: "Working away",
	special: "Special",
};

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

const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

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
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [employmentIds, setEmploymentIds] = useState<string[]>([]);
	const [memberSearch, setMemberSearch] = useState("");

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

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setEmploymentIds([]);
		setMemberSearch("");
	}, []);

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
			resetForm();
			setOpen(false);
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

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (group: Group) => {
		setEditingId(group.id);
		setName(group.name);
		setEmploymentIds(group.employmentIds);
		setMemberSearch("");
		setOpen(true);
	};

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
			]),
		[],
	);

	return (
		<>
			<SettingsCrudCard
				title="All groups"
				description="Team filters you can use on the schedule."
				count={groups.length}
				data={groups}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => row.name}
				searchPlaceholder="Search groups"
				entityLabel="group"
				emptyIcon={<UsersIcon />}
				emptyTitle="No worker groups yet"
				emptyDescription="Group people so you can filter the schedule and staff a week faster."
				addLabel="Add group"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this group?",
					deleteDescription:
						"Workers will be removed from the group. Their employment is unchanged.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit group" : "Add group"}
				description={
					editingId
						? "Update the name and members for this group."
						: "Create a team filter for the schedule."
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
							form="group-form"
							disabled={save.isPending || !name.trim()}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save group" : "Add group"}
						</Button>
					</div>
				}
			>
				<form
					id="group-form"
					className="flex flex-col gap-4"
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
								autoFocus
								required
							/>
						</Field>
						<Field>
							<FieldTitle>Members</FieldTitle>
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
								<div className="max-h-64 overflow-y-auto rounded-lg border p-1">
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
													id={`group-worker-${worker.employmentId}`}
													checked={employmentIds.includes(worker.employmentId)}
													onCheckedChange={() =>
														setEmploymentIds((current) =>
															current.includes(worker.employmentId)
																? current.filter(
																		(id) => id !== worker.employmentId,
																	)
																: [...current, worker.employmentId],
														)
													}
												/>
												<FieldLabel
													htmlFor={`group-worker-${worker.employmentId}`}
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
					</FieldGroup>
				</form>
			</SettingsFormSheet>
		</>
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
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [tagName, setTagName] = useState("");

	const resetForm = useCallback(() => {
		setEditingId(null);
		setTagName("");
	}, []);

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
			resetForm();
			setOpen(false);
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

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (tag: Tag) => {
		setEditingId(tag.id);
		setTagName(tag.name);
		setOpen(true);
	};

	const columns = useMemo(
		() =>
			tagHelper.columns([
				tagHelper.accessor("name", {
					header: "Tag",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
			]),
		[],
	);

	return (
		<>
			<SettingsCrudCard
				title="All tags"
				description="Labels that can appear on a shift tile."
				count={tags.length}
				data={tags}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => row.name}
				searchPlaceholder="Search tags"
				entityLabel="tag"
				emptyIcon={<TagsIcon />}
				emptyTitle="No shift tags yet"
				emptyDescription="Add a short label to use on shift tiles."
				addLabel="Add tag"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this tag?",
					deleteDescription: "Shifts using this tag will lose the label.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit tag" : "Add tag"}
				description="Keep names short — they show on shift tiles."
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
							form="tag-form"
							disabled={!tagName.trim() || save.isPending}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save tag" : "Add tag"}
						</Button>
					</div>
				}
			>
				<form
					id="tag-form"
					className="flex flex-col gap-4"
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
							autoFocus
							required
						/>
					</Field>
				</form>
			</SettingsFormSheet>
		</>
	);
}

export function LeaveTypesCard({
	workplaceId,
	leaveTypes,
}: {
	workplaceId: string | undefined;
	leaveTypes: LeaveTypeDto[];
}) {
	const queryClient = useQueryClient();
	const approvalChains = useApprovalChains(workplaceId);
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [leaveName, setLeaveName] = useState("");
	const [paid, setPaid] = useState(false);
	const [code, setCode] = useState("");
	const [description, setDescription] = useState("");
	const [classification, setClassification] =
		useState<LeaveTypeDto["classification"]>("standard");
	const [active, setActive] = useState(true);
	const [approvalChainId, setApprovalChainId] = useState("default");
	const [policyTarget, setPolicyTarget] = useState<LeaveTypeDto | null>(null);
	const [policyOpen, setPolicyOpen] = useState(false);

	const chainName = useCallback(
		(id: string) =>
			approvalChains.data?.find((chain) => chain.id === id)?.name ?? "",
		[approvalChains.data],
	);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setLeaveName("");
		setPaid(false);
		setCode("");
		setDescription("");
		setClassification("standard");
		setActive(true);
		setApprovalChainId("default");
	}, []);

	const save = useMutation({
		mutationFn: () =>
			api(
				editingId
					? `/v1/workplaces/${workplaceId}/leave-types/${editingId}`
					: `/v1/workplaces/${workplaceId}/leave-types`,
				{
					method: editingId ? "PATCH" : "POST",
					body: {
						name: leaveName.trim(),
						paid,
						code: code.trim(),
						description: description.trim(),
						classification,
						active,
						approvalChainId:
							approvalChainId === "default" ? null : approvalChainId,
					},
				},
			),
		onSuccess: () => {
			resetForm();
			setOpen(false);
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

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (leaveType: LeaveTypeDto) => {
		setEditingId(leaveType.id);
		setLeaveName(leaveType.name);
		setPaid(leaveType.paid);
		setCode(leaveType.code ?? "");
		setDescription(leaveType.description ?? "");
		setClassification(leaveType.classification);
		setActive(leaveType.active);
		setApprovalChainId(leaveType.approvalChainId ?? "default");
		setOpen(true);
	};
	const openPolicy = useCallback((leaveType: LeaveTypeDto) => {
		setPolicyTarget(leaveType);
		setPolicyOpen(true);
	}, []);

	const columns = useMemo(
		() =>
			leaveHelper.columns([
				leaveHelper.accessor("name", {
					header: "Leave type",
					cell: ({ row }) => (
						<span className="flex items-center gap-2">
							<span className="font-medium">{row.original.name}</span>
							{row.original.active ? null : (
								<Badge variant="outline">Inactive</Badge>
							)}
						</span>
					),
				}),
				leaveHelper.accessor(
					(row) => LEAVE_CLASSIFICATION_LABELS[row.classification],
					{
						id: "classification",
						header: "Classification",
						cell: ({ getValue }) => (
							<Badge variant="secondary">{getValue()}</Badge>
						),
					},
				),
				leaveHelper.accessor("paid", {
					header: "Pay",
					cell: ({ getValue }) => (getValue() ? "Paid" : "Unpaid"),
				}),
				leaveHelper.accessor(
					(row) =>
						row.approvalChainId
							? chainName(row.approvalChainId) || "Custom chain"
							: "Default",
					{
						id: "approval",
						header: "Approval",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground">{getValue()}</span>
						),
					},
				),
				leaveHelper.accessor(
					(row) => (row.policy ? "Policy set" : "No policy"),
					{
						id: "policy",
						header: "Policy",
						cell: ({ getValue }) =>
							getValue() === "Policy set" ? (
								<Badge variant="secondary">Policy set</Badge>
							) : (
								<span className="text-muted-foreground">{getValue()}</span>
							),
					},
				),
				leaveHelper.display({
					id: "rules",
					header: () => <span className="block text-right">Rules</span>,
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex justify-end">
							<Button
								variant="outline"
								size="sm"
								onClick={() => openPolicy(row.original)}
							>
								Rules
							</Button>
						</div>
					),
				}),
			]),
		[chainName, openPolicy],
	);

	return (
		<>
			<SettingsCrudCard
				title="All leave types"
				description="Request rules live under Time off. These are the categories people pick."
				count={leaveTypes.length}
				data={leaveTypes}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) =>
					`${row.name} ${row.code ?? ""} ${row.description ?? ""} ${
						LEAVE_CLASSIFICATION_LABELS[row.classification]
					} ${row.paid ? "paid" : "unpaid"}`
				}
				searchPlaceholder="Search leave types"
				entityLabel="leave type"
				emptyIcon={<CalendarOffIcon />}
				emptyTitle="No leave types yet"
				emptyDescription="Add the reasons people can request time off."
				addLabel="Add leave type"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this leave type?",
					deleteDescription:
						"PTO balances for this type will be removed. Existing time-off requests keep their dates.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit leave type" : "Add leave type"}
				description={
					editingId
						? "Update this category, its label, and who approves it."
						: "Paid types deduct remaining hours when a request is approved."
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
							form="leave-form"
							disabled={!leaveName.trim() || save.isPending}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save leave type" : "Add leave type"}
						</Button>
					</div>
				}
			>
				<form
					id="leave-form"
					className="flex flex-col gap-4"
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
							autoFocus
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="leave-code">Code (optional)</FieldLabel>
						<Input
							id="leave-code"
							value={code}
							onChange={(event) => setCode(event.target.value)}
							placeholder="VAC"
							maxLength={12}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="leave-description">
							Description (optional)
						</FieldLabel>
						<Textarea
							id="leave-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="When people should pick this type."
							maxLength={400}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="leave-classification">
							Classification
						</FieldLabel>
						<Select
							items={[...LEAVE_CLASSIFICATION_ITEMS]}
							value={classification}
							onValueChange={(value) => {
								if (value) {
									setClassification(value as LeaveTypeDto["classification"]);
								}
							}}
						>
							<SelectTrigger id="leave-classification" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectGroup>
									{LEAVE_CLASSIFICATION_ITEMS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="leave-approval-chain">
							Approval chain
						</FieldLabel>
						<Select
							items={[
								{ label: "Default / manager approval", value: "default" },
								...(approvalChains.data ?? []).map((chain) => ({
									label: chain.name,
									value: chain.id,
								})),
							]}
							value={approvalChainId}
							onValueChange={(value) => {
								if (value) setApprovalChainId(value);
							}}
						>
							<SelectTrigger id="leave-approval-chain" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectGroup>
									<SelectItem value="default">
										Default / manager approval
									</SelectItem>
									{(approvalChains.data ?? []).map((chain) => (
										<SelectItem key={chain.id} value={chain.id}>
											{chain.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
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
					<Field orientation="horizontal" className="items-center">
						<Checkbox
							id="leave-active"
							checked={active}
							onCheckedChange={(checked) => setActive(checked === true)}
						/>
						<FieldLabel htmlFor="leave-active" className="font-normal">
							Active
						</FieldLabel>
					</Field>
				</form>
			</SettingsFormSheet>

			<LeavePolicySheet
				workplaceId={workplaceId}
				leaveType={policyTarget}
				open={policyOpen}
				onOpenChange={setPolicyOpen}
			/>
		</>
	);
}

function RangeSection({
	kind,
	label,
	emptyTitle,
	emptyDescription,
	emptyIcon,
	rows,
	locationId,
	locations,
	onLocationChange,
	isLoading,
}: {
	kind: "time-blocks" | "day-parts";
	label: string;
	emptyTitle: string;
	emptyDescription: string;
	emptyIcon: ReactNode;
	rows: RangeRow[];
	locationId: string | undefined;
	locations: LocationDto[];
	onLocationChange: (id: string) => void;
	isLoading: boolean;
}) {
	const { formatMinute } = useDisplayPrefs();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [startMinute, setStartMinute] = useState(9 * 60);
	const [endMinute, setEndMinute] = useState(17 * 60);
	const lower = label.toLowerCase();

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setStartMinute(9 * 60);
		setEndMinute(17 * 60);
	}, []);

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
			resetForm();
			setOpen(false);
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

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (row: RangeRow) => {
		setEditingId(row.id);
		setName(row.name);
		setStartMinute(row.startMinute);
		setEndMinute(row.endMinute);
		setOpen(true);
	};

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
			]),
		[formatMinute],
	);

	return (
		<>
			<SettingsCrudCard
				title={label === "Time Block" ? "All time blocks" : "All day parts"}
				description={
					label === "Time Block"
						? "Windows you can drop onto the week while building a schedule."
						: "Parts of service for this location, such as breakfast or dinner."
				}
				count={rows.length}
				data={rows}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => row.name}
				searchPlaceholder={`Search ${lower}s`}
				toolbar={
					<SettingsLocationField
						locations={locations}
						locationId={locationId}
						onLocationChange={(id) => {
							resetForm();
							onLocationChange(id);
						}}
					/>
				}
				isLoading={Boolean(locationId) && isLoading}
				entityLabel={lower}
				emptyIcon={emptyIcon}
				emptyTitle={emptyTitle}
				emptyDescription={emptyDescription}
				addLabel={`Add ${lower}`}
				onAdd={locationId ? startAdd : undefined}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: `Delete this ${lower}?`,
					deleteDescription: `This ${lower} will be removed from the location.`,
					deleteDisabled: remove.isPending,
				}}
			/>

			{locationId ? (
				<SettingsFormSheet
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) resetForm();
					}}
					title={editingId ? `Edit ${lower}` : `Add ${lower}`}
					description={
						editingId
							? `Update the name or hours for this ${lower}.`
							: `Give this ${lower} a name and a start and end time.`
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
								form={`${kind}-form`}
								disabled={!name.trim() || save.isPending}
							>
								{save.isPending ? <Spinner data-icon="inline-start" /> : null}
								{editingId ? `Save ${lower}` : `Add ${lower}`}
							</Button>
						</div>
					}
				>
					<form
						id={`${kind}-form`}
						className="flex flex-col gap-4"
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
									autoFocus
									required
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
									overnightAfterMinute={startMinute}
								/>
							</Field>
						</FieldGroup>
					</form>
				</SettingsFormSheet>
			) : null}
		</>
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
			emptyIcon={<ClockIcon />}
			emptyTitle="No time blocks yet"
			emptyDescription="Named windows you can drop onto the week while building a schedule."
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
			emptyIcon={<SunIcon />}
			emptyTitle="No day parts yet"
			emptyDescription="Parts of service for this location, such as breakfast or dinner."
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
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [templateName, setTemplateName] = useState("");
	const [positionId, setPositionId] = useState("");
	const [templateStart, setTemplateStart] = useState(9 * 60);
	const [templateEnd, setTemplateEnd] = useState(17 * 60);
	const [note, setNote] = useState("");

	const positionName = useCallback(
		(id: string) =>
			positions.find((position) => position.id === id)?.name ?? "",
		[positions],
	);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setTemplateName("");
		setPositionId("");
		setTemplateStart(9 * 60);
		setTemplateEnd(17 * 60);
		setNote("");
	}, []);

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
						// Always send a string on edit so an emptied note clears server-side.
						note: editingId ? note.trim() : note.trim() || undefined,
					},
				},
			),
		onSuccess: () => {
			resetForm();
			setOpen(false);
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

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (template: TemplateRow) => {
		setEditingId(template.id);
		setTemplateName(template.name);
		setPositionId(template.positionId);
		setTemplateStart(template.startMinute);
		setTemplateEnd(template.endMinute);
		setNote(template.note ?? "");
		setOpen(true);
	};

	const columns = useMemo(
		() =>
			templateHelper.columns([
				templateHelper.accessor("name", {
					header: "Template",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				templateHelper.accessor((row) => positionName(row.positionId), {
					id: "position",
					header: "Position",
					cell: ({ getValue }) => getValue() || "—",
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
			]),
		[formatMinute, positionName],
	);

	const templates = data?.shiftTemplates ?? [];

	return (
		<>
			<SettingsCrudCard
				title="All templates"
				description="Reusable shift shapes for a position at this location."
				count={templates.length}
				data={templates}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) =>
					`${row.name} ${positionName(row.positionId)} ${row.note ?? ""}`
				}
				searchPlaceholder="Search templates"
				toolbar={
					<SettingsLocationField
						locations={locations}
						locationId={locationId}
						onLocationChange={(id) => {
							resetForm();
							onLocationChange(id);
						}}
					/>
				}
				isLoading={Boolean(locationId) && isLoading}
				entityLabel="template"
				emptyIcon={<LayoutTemplateIcon />}
				emptyTitle="No shift templates yet"
				emptyDescription="Save a position and time window you reuse often."
				addLabel="Add template"
				onAdd={locationId ? startAdd : undefined}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this template?",
					deleteDescription: "This template will be removed from the location.",
					deleteDisabled: remove.isPending,
				}}
			/>

			{locationId ? (
				<SettingsFormSheet
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) resetForm();
					}}
					title={editingId ? "Edit template" : "Add template"}
					description={
						editingId
							? "Update the position, hours, or note for this template."
							: "Save a position and time window you reuse often."
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
								form="template-form"
								disabled={!templateName.trim() || !positionId || save.isPending}
							>
								{save.isPending ? <Spinner data-icon="inline-start" /> : null}
								{editingId ? "Save template" : "Add template"}
							</Button>
						</div>
					}
				>
					<form
						id="template-form"
						className="flex flex-col gap-4"
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
									autoFocus
									required
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
									overnightAfterMinute={templateStart}
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
				</SettingsFormSheet>
			) : null}
		</>
	);
}
