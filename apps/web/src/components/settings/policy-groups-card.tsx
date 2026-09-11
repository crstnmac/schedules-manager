import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import { api } from "@/lib/api";

export type ApprovalRequestType =
	| "time_off"
	| "unavailability"
	| "shift_release"
	| "shift_pickup"
	| "shift_swap";

export interface ApprovalPolicyRuleDto {
	requestType: ApprovalRequestType;
	requiresApproval: boolean;
}

export interface ApprovalPolicyGroupDto {
	id: string;
	name: string;
	description: string | null;
	rules: ApprovalPolicyRuleDto[];
}

export const APPROVAL_REQUEST_TYPES: readonly ApprovalRequestType[] = [
	"time_off",
	"unavailability",
	"shift_release",
	"shift_pickup",
	"shift_swap",
] as const;

const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
	time_off: "Time off",
	unavailability: "Unavailability",
	shift_release: "Shift release",
	shift_pickup: "Shift pickup",
	shift_swap: "Shift swap",
};

const REQUEST_TYPE_HINTS: Record<ApprovalRequestType, string> = {
	time_off: "Time-off requests from workers.",
	unavailability: "Windows a worker asks not to be scheduled.",
	shift_release: "A worker giving up an assigned Shift.",
	shift_pickup: "A worker taking an Open Shift.",
	shift_swap: "Two workers exchanging Shifts.",
};

function rulesRecord(
	rules: ApprovalPolicyRuleDto[] | undefined,
): Record<ApprovalRequestType, boolean> {
	const byType = new Map(
		(rules ?? []).map(
			(rule) => [rule.requestType, rule.requiresApproval] as const,
		),
	);
	return Object.fromEntries(
		APPROVAL_REQUEST_TYPES.map((requestType) => [
			requestType,
			byType.get(requestType) ?? true,
		]),
	) as Record<ApprovalRequestType, boolean>;
}

/**
 * Local query hook for Approval Policy Groups. Kept beside the card rather
 * than in lib/queries.ts so this feature stays self-contained.
 */
export function useApprovalPolicyGroups(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["approval-policy-groups", workplaceId],
		queryFn: () =>
			api<{ groups: ApprovalPolicyGroupDto[] }>(
				`/v1/workplaces/${workplaceId}/approval-policy-groups`,
			),
		enabled: Boolean(workplaceId),
	});
}

function useSaveApprovalPolicyGroup(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			groupId: string | null;
			name: string;
			description?: string;
			rules: ApprovalPolicyRuleDto[];
		}) =>
			api(
				input.groupId
					? `/v1/workplaces/${workplaceId}/approval-policy-groups/${input.groupId}`
					: `/v1/workplaces/${workplaceId}/approval-policy-groups`,
				{
					method: input.groupId ? "PUT" : "POST",
					body: {
						name: input.name,
						description: input.description,
						rules: input.rules,
					},
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["approval-policy-groups", workplaceId],
			});
		},
		onError: (error) => toast.error((error as Error).message),
	});
}

function useDeleteApprovalPolicyGroup(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (groupId: string) =>
			api(`/v1/workplaces/${workplaceId}/approval-policy-groups/${groupId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["approval-policy-groups", workplaceId],
			});
			toast.success("Approval policy group deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
}

const groupHelper = createDataColumnHelper<ApprovalPolicyGroupDto>();

const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

export function PolicyGroupsCard({
	workplaceId,
	groups,
	isLoading,
}: {
	workplaceId: string | undefined;
	groups: ApprovalPolicyGroupDto[];
	isLoading: boolean;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [rules, setRules] = useState<Record<ApprovalRequestType, boolean>>(() =>
		rulesRecord(undefined),
	);

	const save = useSaveApprovalPolicyGroup(workplaceId);
	const remove = useDeleteApprovalPolicyGroup(workplaceId);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setDescription("");
		setRules(rulesRecord(undefined));
	}, []);

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (group: ApprovalPolicyGroupDto) => {
		setEditingId(group.id);
		setName(group.name);
		setDescription(group.description ?? "");
		setRules(rulesRecord(group.rules));
		setOpen(true);
	};

	const submit = () => {
		save.mutate(
			{
				groupId: editingId,
				name: name.trim(),
				description: description.trim() || undefined,
				rules: APPROVAL_REQUEST_TYPES.map((requestType) => ({
					requestType,
					requiresApproval: rules[requestType],
				})),
			},
			{
				onSuccess: () => {
					resetForm();
					setOpen(false);
					queryClient.invalidateQueries({
						queryKey: ["approval-policy-groups", workplaceId],
					});
					toast.success("Approval policy group saved.");
				},
			},
		);
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
				groupHelper.accessor(
					(row) =>
						APPROVAL_REQUEST_TYPES.filter(
							(requestType) => rulesRecord(row.rules)[requestType] === true,
						).length,
					{
						id: "requiresApproval",
						header: "Needs approval",
						cell: ({ getValue }) => {
							const count = getValue();
							return `${count} of ${APPROVAL_REQUEST_TYPES.length}`;
						},
					},
				),
			]),
		[],
	);

	return (
		<>
			<SettingsCrudCard
				title="All approval policy groups"
				description="Decide which worker requests a Manager must approve for a Schedule week."
				count={groups.length}
				data={groups}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => `${row.name} ${row.description ?? ""}`}
				searchPlaceholder="Search groups"
				isLoading={isLoading}
				entityLabel="approval policy group"
				emptyIcon={<ShieldCheckIcon />}
				emptyTitle="No approval policy groups yet"
				emptyDescription="Create a group to auto-approve some request types or keep them in the Manager queue."
				addLabel="Add group"
				onAdd={workplaceId ? startAdd : undefined}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this approval policy group?",
					deleteDescription:
						"Schedules using this group fall back to the previous week's policy or the default: all requests need approval.",
					deleteDisabled: remove.isPending,
				}}
			/>

			{workplaceId ? (
				<SettingsFormSheet
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) resetForm();
					}}
					title={
						editingId
							? "Edit approval policy group"
							: "Add approval policy group"
					}
					description="Turn approval off for a request type to let it take effect without a Manager decision."
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
								form="approval-policy-group-form"
								disabled={!name.trim() || save.isPending}
							>
								{save.isPending ? <Spinner data-icon="inline-start" /> : null}
								{editingId ? "Save group" : "Add group"}
							</Button>
						</div>
					}
				>
					<form
						id="approval-policy-group-form"
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							submit();
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="approval-group-name">Name</FieldLabel>
								<Input
									id="approval-group-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Standard week"
									autoFocus
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="approval-group-description">
									Description (optional)
								</FieldLabel>
								<Textarea
									id="approval-group-description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									placeholder="When this policy applies and why."
								/>
							</Field>
							<Field>
								<FieldTitle>Request types</FieldTitle>
								<div className="flex flex-col gap-2">
									{APPROVAL_REQUEST_TYPES.map((requestType) => (
										<Field
											key={requestType}
											orientation="horizontal"
											className="items-start rounded-md border p-3"
										>
											<Checkbox
												id={`approval-${requestType}`}
												checked={rules[requestType]}
												onCheckedChange={(checked) =>
													setRules((current) => ({
														...current,
														[requestType]: checked === true,
													}))
												}
											/>
											<div className="flex flex-col gap-0.5">
												<FieldLabel
													htmlFor={`approval-${requestType}`}
													className="font-normal"
												>
													{REQUEST_TYPE_LABELS[requestType]} needs approval
												</FieldLabel>
												<span className="text-muted-foreground text-xs">
													{rules[requestType]
														? REQUEST_TYPE_HINTS[requestType]
														: "Takes effect immediately without a Manager decision."}
												</span>
											</div>
										</Field>
									))}
								</div>
							</Field>
						</FieldGroup>
					</form>
				</SettingsFormSheet>
			) : null}
		</>
	);
}
