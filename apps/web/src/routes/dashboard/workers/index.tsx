import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { usePostHog } from "@posthog/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	BanIcon,
	CopyIcon,
	EllipsisIcon,
	FileUpIcon,
	IdCardIcon,
	LinkIcon,
	RefreshCwIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { FormSheet } from "@/components/form-sheet";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { api } from "@/lib/api";
import {
	type InvitationDto,
	useLocations,
	usePositions,
	useWorkers,
	type WorkerDto,
} from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";
import { parseWorkerCsv, type WorkerImportRow } from "@/lib/worker-import";

export const Route = createFileRoute("/dashboard/workers/")({
	component: WorkersPage,
});

const workerHelper = createDataColumnHelper<WorkerDto>();
const invitationHelper = createDataColumnHelper<InvitationDto>();

const ROLE_FILTERS = [
	{ label: "All roles", value: "all" },
	{ label: "Managers", value: "manager" },
	{ label: "Workers", value: "worker" },
];

const INVITATION_FILTERS = [
	{ label: "All invitations", value: "all" },
	{ label: "Pending", value: "pending" },
	{ label: "Accepted", value: "accepted" },
	{ label: "Revoked", value: "revoked" },
];

function WorkersPage() {
	const { workplace, employmentId: myEmploymentId } = useWorkplace();
	const { formatPerson } = useDisplayPrefs();
	const posthog = usePostHog();
	const navigate = useNavigate();
	const workers = useWorkers(workplace?.id);
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);

	const [tab, setTab] = useState<"team" | "invitations">("team");
	const [teamSearch, setTeamSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState("all");
	const [inviteSearch, setInviteSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");

	const [inviteOpen, setInviteOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [deactivateTarget, setDeactivateTarget] = useState<WorkerDto | null>(
		null,
	);
	const [revokeTarget, setRevokeTarget] = useState<InvitationDto | null>(null);

	const [email, setEmail] = useState("");
	const [kind, setKind] = useState<"worker" | "manager">("worker");
	const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
	const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
	const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);
	const [importRows, setImportRows] = useState<WorkerImportRow[]>([]);

	const queryClient = useQueryClient();

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplace?.id, "workers"],
		});
		queryClient.invalidateQueries({ queryKey: ["me"] });
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplace?.id, "email-deliveries"],
		});
	}

	function resetInviteForm() {
		setEmail("");
		setSelectedLocations([]);
		setSelectedPositions([]);
	}

	const invite = useMutation({
		mutationFn: () =>
			api<{ invitation: { token: string } }>(
				`/v1/workplaces/${workplace?.id}/invitations`,
				{
					method: "POST",
					body: {
						email: email.trim(),
						kind,
						locationIds: selectedLocations,
						positionIds: selectedPositions,
					},
				},
			),
		onSuccess: (data) => {
			setLastInviteToken(data.invitation.token);
			posthog?.capture("invitation_sent", {
				invitee_role: kind,
				location_count: selectedLocations.length,
				position_count: selectedPositions.length,
			});
			resetInviteForm();
			setInviteOpen(false);
			setTab("invitations");
			invalidate();
			toast.success("Invitation created. Email queued for delivery.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const resend = useMutation({
		mutationFn: (invitationId: string) =>
			api<{ invitation: { token: string } }>(
				`/v1/workplaces/${workplace?.id}/invitations/${invitationId}/resend`,
				{ method: "POST" },
			),
		onSuccess: (data) => {
			setLastInviteToken(data.invitation.token);
			invalidate();
			toast.success("Invitation refreshed. Email queued for delivery.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const revoke = useMutation({
		mutationFn: (invitationId: string) =>
			api(`/v1/workplaces/${workplace?.id}/invitations/${invitationId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Invitation revoked.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const deactivate = useMutation({
		mutationFn: (employmentId: string) =>
			api(
				`/v1/workplaces/${workplace?.id}/employments/${employmentId}/deactivate`,
				{ method: "POST" },
			),
		onSuccess: () => {
			invalidate();
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
			toast.success("Access removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const importWorkers = useMutation({
		mutationFn: () =>
			api<{ invitations: { email: string; token: string }[] }>(
				`/v1/workplaces/${workplace?.id}/invitations/import`,
				{ method: "POST", body: { rows: importRows } },
			),
		onSuccess: async (result) => {
			setImportRows([]);
			setImportOpen(false);
			setTab("invitations");
			await invalidate();
			const links = result.invitations
				.map((item) => `${item.email},${inviteLink(item.token)}`)
				.join("\n");
			await navigator.clipboard
				.writeText(`email,invite_link\n${links}`)
				.catch(() => undefined);
			toast.success(
				`${result.invitations.length} invitations created. Invite links were copied as CSV.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	async function readCsv(file: File) {
		try {
			setImportRows(parseWorkerCsv(await file.text()));
		} catch (error) {
			toast.error((error as Error).message);
		}
	}

	function toggle(
		list: string[],
		id: string,
		setList: (next: string[]) => void,
	) {
		setList(
			list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
		);
	}

	const activeWorkers =
		workers.data?.workers.filter((worker) => worker.status === "active") ?? [];
	const invitations = workers.data?.invitations ?? [];

	const teamRows = useMemo(() => {
		const term = teamSearch.trim().toLowerCase();
		return activeWorkers.filter((worker) => {
			if (roleFilter !== "all" && worker.kind !== roleFilter) return false;
			if (!term) return true;
			return `${worker.profile.fullName ?? ""} ${worker.profile.email}`
				.toLowerCase()
				.includes(term);
		});
	}, [activeWorkers, roleFilter, teamSearch]);

	const invitationRows = useMemo(() => {
		const term = inviteSearch.trim().toLowerCase();
		return invitations.filter((invitation) => {
			if (statusFilter !== "all" && invitation.status !== statusFilter) {
				return false;
			}
			if (!term) return true;
			return invitation.email.toLowerCase().includes(term);
		});
	}, [invitations, inviteSearch, statusFilter]);

	const locationNames = useMemo(() => {
		const map = new Map<string, string>();
		for (const location of locations.data ?? []) {
			map.set(location.id, location.name);
		}
		return map;
	}, [locations.data]);

	const teamPagination = useTablePagination(teamRows, {
		resetKey: `${teamSearch}|${roleFilter}`,
	});
	const invitationPagination = useTablePagination(invitationRows, {
		resetKey: `${inviteSearch}|${statusFilter}`,
	});

	const deliveryQuery = useQuery({
		queryKey: ["workplaces", workplace?.id, "email-deliveries"],
		enabled: Boolean(workplace?.id) && invitations.length > 0,
		queryFn: () =>
			api<{ deliveries: InvitationEmailDelivery[] }>(
				`/v1/workplaces/${workplace?.id}/email-deliveries`,
			),
		refetchInterval: 15_000,
	});
	const latestDeliveries = new Map<string, InvitationEmailDelivery>();
	for (const delivery of deliveryQuery.data?.deliveries ?? []) {
		if (!latestDeliveries.has(delivery.invitationId)) {
			latestDeliveries.set(delivery.invitationId, delivery);
		}
	}

	const workerColumns = useMemo(
		() =>
			workerHelper.columns([
				workerHelper.accessor(
					(row) => formatPerson(row.profile.fullName, row.profile.email),
					{
						id: "worker",
						header: "Worker",
						cell: ({ row }) => (
							<div className="flex flex-col">
								<span className="font-medium">
									{row.original.profile.fullName ?? row.original.profile.email}
								</span>
								<span className="text-muted-foreground text-xs">
									{row.original.profile.email}
								</span>
							</div>
						),
					},
				),
				workerHelper.accessor("kind", {
					header: "Role",
					cell: ({ getValue }) => (
						<Badge variant="outline" className="capitalize">
							{getValue()}
						</Badge>
					),
				}),
				workerHelper.accessor((row) => row.locationIds.length, {
					id: "locations",
					header: "Locations",
					cell: ({ row }) => {
						const names = row.original.locationIds.map(
							(id) => locationNames.get(id) ?? "Location",
						);
						if (names.length === 0) {
							return <span className="text-muted-foreground">—</span>;
						}
						return (
							<span className="text-muted-foreground">
								{names.slice(0, 2).join(", ")}
								{names.length > 2 ? ` +${names.length - 2}` : ""}
							</span>
						);
					},
				}),
				workerHelper.accessor("hourlyWageCents", {
					id: "wage",
					header: "Wage",
					cell: ({ getValue }) => {
						const cents = getValue();
						return cents != null ? `$${(cents / 100).toFixed(2)}/hr` : "—";
					},
				}),
				workerHelper.display({
					id: "actions",
					header: () => <span className="block text-right">Actions</span>,
					enableSorting: false,
					cell: ({ row }) => {
						const worker = row.original;
						const isSelf = worker.employmentId === myEmploymentId;
						return (
							<div className="flex justify-end">
								<DropdownMenu>
									<DropdownMenuTrigger
										render={<Button variant="ghost" size="icon-sm" />}
									>
										<EllipsisIcon />
										<span className="sr-only">
											Actions for {worker.profile.email}
										</span>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem
											onClick={() =>
												navigate({
													to: "/dashboard/workers/$employmentId",
													params: { employmentId: worker.employmentId },
												})
											}
										>
											<IdCardIcon />
											View employment
										</DropdownMenuItem>
										{isSelf ? null : (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													onClick={() => setDeactivateTarget(worker)}
												>
													<BanIcon />
													Deactivate
												</DropdownMenuItem>
											</>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						);
					},
				}),
			]),
		[formatPerson, locationNames, myEmploymentId, navigate],
	);

	const invitationColumns = useMemo(
		() =>
			invitationHelper.columns([
				invitationHelper.accessor("email", {
					header: "Invitation",
					cell: ({ row }) => (
						<div className="flex flex-col">
							<span className="font-medium">{row.original.email}</span>
							<span className="text-muted-foreground text-xs capitalize">
								{row.original.kind}
							</span>
						</div>
					),
				}),
				invitationHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => (
						<Badge
							className="uppercase"
							variant={
								getValue() === "revoked"
									? "destructive"
									: getValue() === "accepted"
										? "default"
										: "secondary"
							}
						>
							{getValue()}
						</Badge>
					),
				}),
				invitationHelper.accessor("expiresAt", {
					header: "Expires",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">
							{new Date(getValue()).toLocaleDateString()}
						</span>
					),
				}),
				invitationHelper.display({
					id: "delivery",
					header: "Email",
					enableSorting: false,
					cell: ({ row }) => {
						const delivery = latestDeliveries.get(row.original.id);
						if (!delivery) {
							return (
								<span className="text-muted-foreground text-xs">
									{deliveryQuery.isPending ? "…" : "—"}
								</span>
							);
						}
						const failed =
							delivery.status === "failed" || delivery.status === "bounced";
						return (
							<Badge
								variant={failed ? "destructive" : "outline"}
								className="capitalize"
								title={delivery.lastError ?? undefined}
							>
								{delivery.status}
							</Badge>
						);
					},
				}),
				invitationHelper.display({
					id: "actions",
					header: () => <span className="block text-right">Actions</span>,
					enableSorting: false,
					cell: ({ row }) => {
						const invitation = row.original;
						const isPending =
							invitation.status === "pending" &&
							new Date(invitation.expiresAt).getTime() > Date.now();
						return (
							<div className="flex justify-end">
								<DropdownMenu>
									<DropdownMenuTrigger
										render={<Button variant="ghost" size="icon-sm" />}
									>
										<EllipsisIcon />
										<span className="sr-only">
											Actions for {invitation.email}
										</span>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{invitation.token ? (
											<DropdownMenuItem
												onClick={() => {
													navigator.clipboard
														.writeText(inviteLink(invitation.token ?? ""))
														.then(() => toast.success("Invite link copied."))
														.catch(() => toast.error("Copy failed."));
												}}
											>
												<CopyIcon />
												Copy invite link
											</DropdownMenuItem>
										) : null}
										{isPending ? (
											<DropdownMenuItem
												onClick={() => resend.mutate(invitation.id)}
											>
												<RefreshCwIcon />
												Resend email
											</DropdownMenuItem>
										) : null}
										{isPending ? (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													onClick={() => setRevokeTarget(invitation)}
												>
													<BanIcon />
													Revoke
												</DropdownMenuItem>
											</>
										) : null}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						);
					},
				}),
			]),
		[deliveryQuery.isPending, latestDeliveries, resend],
	);

	const pendingCount = invitations.filter(
		(invitation) => invitation.status === "pending",
	).length;

	return (
		<AppPage>
			<AppPageHeader
				title="Workers"
				badge={<Badge variant="secondary">{activeWorkers.length} active</Badge>}
				description="Invite people, manage roles, and open an employment to set pay and PTO."
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setImportOpen(true)}
						>
							<FileUpIcon data-icon="inline-start" />
							Import CSV
						</Button>
						<Button size="sm" onClick={() => setInviteOpen(true)}>
							<UserPlusIcon data-icon="inline-start" />
							Invite worker
						</Button>
					</div>
				}
			/>
			<AppPageBody scroll={false}>
				<Tabs
					value={tab}
					onValueChange={(value) => setTab(value as "team" | "invitations")}
					className="min-h-0 flex-1 gap-0"
				>
					<div className="shrink-0 border-b px-4 py-2">
						<TabsList variant="line">
							<TabsTrigger value="team">
								Team
								<Badge variant="secondary">{activeWorkers.length}</Badge>
							</TabsTrigger>
							<TabsTrigger value="invitations">
								Invitations
								{pendingCount > 0 ? (
									<Badge variant="secondary">{pendingCount}</Badge>
								) : null}
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="team" className="flex min-h-0 flex-1 flex-col">
						<TableToolbar
							left={
								<>
									<TableSearch
										value={teamSearch}
										onValueChange={setTeamSearch}
										placeholder="Search name or email"
									/>
									<TableFilter
										value={roleFilter}
										onValueChange={setRoleFilter}
										items={ROLE_FILTERS}
										ariaLabel="Filter by role"
									/>
								</>
							}
							right={<TablePagination {...teamPagination} />}
						/>
						<div className="min-h-0 flex-1 overflow-auto">
							{workers.isLoading ? (
								<div className="flex flex-col gap-3 p-4">
									<Skeleton className="h-12" />
									<Skeleton className="h-12" />
									<Skeleton className="h-12" />
								</div>
							) : (
								<DataTable
									fill={false}
									stacked
									columns={workerColumns}
									data={teamPagination.pageRows}
									getRowId={(row) => row.employmentId}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyMedia variant="icon">
														<UsersIcon />
													</EmptyMedia>
													<EmptyTitle>
														{activeWorkers.length === 0
															? "No workers yet"
															: "No workers match"}
													</EmptyTitle>
													<EmptyDescription>
														{activeWorkers.length === 0
															? "Send your first invitation to bring someone onto the team."
															: "Try a different search or role filter."}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										</div>
									}
								/>
							)}
						</div>
					</TabsContent>

					<TabsContent
						value="invitations"
						className="flex min-h-0 flex-1 flex-col"
					>
						{lastInviteToken ? (
							<Alert className="shrink-0 rounded-none border-x-0 border-t-0">
								<LinkIcon />
								<AlertTitle>Latest invite link</AlertTitle>
								<AlertDescription>
									<p className="mb-2">
										Share this link with the person you just invited.
									</p>
									<InputGroup className="min-w-0">
										<InputGroupInput
											readOnly
											value={inviteLink(lastInviteToken)}
										/>
										<InputGroupAddon align="inline-end">
											<InputGroupButton
												aria-label="Copy invite link"
												onClick={() => {
													navigator.clipboard
														.writeText(inviteLink(lastInviteToken))
														.then(() => toast.success("Invite link copied."))
														.catch(() => toast.error("Copy failed."));
												}}
											>
												<CopyIcon />
											</InputGroupButton>
										</InputGroupAddon>
									</InputGroup>
								</AlertDescription>
							</Alert>
						) : null}
						<TableToolbar
							left={
								<>
									<TableSearch
										value={inviteSearch}
										onValueChange={setInviteSearch}
										placeholder="Search email"
									/>
									<TableFilter
										value={statusFilter}
										onValueChange={setStatusFilter}
										items={INVITATION_FILTERS}
										ariaLabel="Filter by status"
									/>
								</>
							}
							right={<TablePagination {...invitationPagination} />}
						/>
						<div className="min-h-0 flex-1 overflow-auto">
							<DataTable
								fill={false}
								stacked
								columns={invitationColumns}
								data={invitationPagination.pageRows}
								getRowId={(row) => row.id}
								empty={
									<div className="p-4">
										<Empty className="border border-dashed">
											<EmptyHeader>
												<EmptyTitle>No invitations</EmptyTitle>
												<EmptyDescription>
													Invite a worker to send them a sign-in link.
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</div>
								}
							/>
						</div>
					</TabsContent>
				</Tabs>
			</AppPageBody>

			<FormSheet
				open={inviteOpen}
				onOpenChange={setInviteOpen}
				title="Invite a worker"
				description="We'll email the invitation automatically. You can also copy the invite link after sending."
				footer={
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button variant="outline" onClick={() => setInviteOpen(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							form="invite-form"
							disabled={invite.isPending || !email.trim()}
						>
							{invite.isPending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<UserPlusIcon data-icon="inline-start" />
							)}
							{invite.isPending ? "Inviting…" : "Send invitation"}
						</Button>
					</div>
				}
			>
				<form
					id="invite-form"
					onSubmit={(event) => {
						event.preventDefault();
						invite.mutate();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="invite-email">Email</FieldLabel>
							<Input
								id="invite-email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="worker@example.com"
								autoFocus
								required
							/>
						</Field>
						<Field>
							<FieldLabel>They are a…</FieldLabel>
							<ToggleGroup
								className="grid w-full grid-cols-2"
								variant="outline"
								value={[kind]}
								onValueChange={(value) => {
									const next = value[0];
									if (next === "worker" || next === "manager") {
										setKind(next);
									}
								}}
								aria-label="Role"
							>
								<ToggleGroupItem value="worker">Worker</ToggleGroupItem>
								<ToggleGroupItem value="manager">Manager</ToggleGroupItem>
							</ToggleGroup>
						</Field>
						{locations.data && locations.data.length > 0 ? (
							<FieldSet>
								<FieldLegend variant="label">
									Locations they can work
								</FieldLegend>
								<FieldGroup className="grid grid-cols-2 gap-2">
									{locations.data.map((location) => (
										<Field key={location.id} orientation="horizontal">
											<Checkbox
												id={`invite-location-${location.id}`}
												aria-label={location.name}
												checked={selectedLocations.includes(location.id)}
												onCheckedChange={() =>
													toggle(
														selectedLocations,
														location.id,
														setSelectedLocations,
													)
												}
											/>
											<FieldLabel
												htmlFor={`invite-location-${location.id}`}
												className="font-normal"
											>
												{location.name}
											</FieldLabel>
										</Field>
									))}
								</FieldGroup>
							</FieldSet>
						) : null}
						{positions.data && positions.data.length > 0 ? (
							<FieldSet>
								<FieldLegend variant="label">
									Positions they can work
								</FieldLegend>
								<FieldGroup className="grid grid-cols-2 gap-2">
									{positions.data.map((position) => (
										<Field key={position.id} orientation="horizontal">
											<Checkbox
												id={`invite-position-${position.id}`}
												aria-label={position.name}
												checked={selectedPositions.includes(position.id)}
												onCheckedChange={() =>
													toggle(
														selectedPositions,
														position.id,
														setSelectedPositions,
													)
												}
											/>
											<FieldLabel
												htmlFor={`invite-position-${position.id}`}
												className="font-normal"
											>
												{position.name}
											</FieldLabel>
										</Field>
									))}
								</FieldGroup>
							</FieldSet>
						) : null}
					</FieldGroup>
				</form>
			</FormSheet>

			<FormSheet
				open={importOpen}
				onOpenChange={setImportOpen}
				title="Import your team"
				description="CSV columns: name, email, phone, position, location. Names must match Settings. Invite links are created and copied; no email is sent."
				footer={
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button variant="outline" onClick={() => setImportOpen(false)}>
							Cancel
						</Button>
						<Button
							disabled={importRows.length === 0 || importWorkers.isPending}
							onClick={() => importWorkers.mutate()}
						>
							{importWorkers.isPending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<FileUpIcon data-icon="inline-start" />
							)}
							Create {importRows.length || ""} invitations
						</Button>
					</div>
				}
			>
				<Field>
					<FieldLabel htmlFor="worker-csv">CSV file</FieldLabel>
					<Input
						id="worker-csv"
						type="file"
						accept=".csv,text/csv"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void readCsv(file);
						}}
					/>
				</Field>
				{importRows.length > 0 ? (
					<Alert>
						<FileUpIcon />
						<AlertTitle>
							{importRows.length} worker
							{importRows.length === 1 ? "" : "s"} ready
						</AlertTitle>
						<AlertDescription>
							Create shareable invitation links. No email will be sent.
						</AlertDescription>
					</Alert>
				) : null}
			</FormSheet>

			<AlertDialog
				open={deactivateTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeactivateTarget(null);
				}}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogMedia>
							<UsersIcon />
						</AlertDialogMedia>
						<AlertDialogTitle>Remove this person?</AlertDialogTitle>
						<AlertDialogDescription>
							{deactivateTarget?.profile.email} will lose access to this
							workplace.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deactivate.isPending}
							onClick={() => {
								if (deactivateTarget) {
									deactivate.mutate(deactivateTarget.employmentId);
								}
								setDeactivateTarget(null);
							}}
						>
							Deactivate
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={revokeTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRevokeTarget(null);
				}}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
						<AlertDialogDescription>
							The invite link for {revokeTarget?.email} will stop working.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={revoke.isPending}
							onClick={() => {
								if (revokeTarget) revoke.mutate(revokeTarget.id);
								setRevokeTarget(null);
							}}
						>
							Revoke
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</AppPage>
	);
}

function inviteLink(token: string) {
	return `${window.location.origin}/invite/${token}`;
}

type InvitationEmailDelivery = {
	invitationId: string;
	status:
		| "queued"
		| "sending"
		| "sent"
		| "delivered"
		| "bounced"
		| "failed"
		| "cancelled";
	attempts: number;
	availableAt: string;
	lastError: string | null;
};
