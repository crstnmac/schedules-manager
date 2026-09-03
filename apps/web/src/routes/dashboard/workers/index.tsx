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
	AlertDialogTrigger,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
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
	FieldTitle,
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
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CopyIcon,
	FileUpIcon,
	LinkIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import {
	type InvitationDto,
	useLocations,
	usePositions,
	useWorkers,
	type WorkerDto,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { parseWorkerCsv, type WorkerImportRow } from "@/lib/worker-import";

export const Route = createFileRoute("/dashboard/workers/")({
	component: WorkersPage,
});

const workerHelper = createDataColumnHelper<WorkerDto>();
const invitationHelper = createDataColumnHelper<InvitationDto>();

function WorkersPage() {
	const { workplace } = useWorkplace();
	const { formatPerson } = useDisplayPrefs();
	const workers = useWorkers(workplace?.id);
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);

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
			setEmail("");
			setSelectedLocations([]);
			setSelectedPositions([]);
			invalidate();
			toast.success("Invitation created. Email queued for delivery.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const resend = useMutation({
		mutationFn: (invitationId: string) =>
			api(
				`/v1/workplaces/${workplace?.id}/invitations/${invitationId}/resend`,
				{ method: "POST" },
			),
		onSuccess: () => {
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

	function submitInvite(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		invite.mutate();
	}

	const activeWorkers =
		workers.data?.workers.filter((worker) => worker.status === "active") ?? [];
	const invitations = workers.data?.invitations ?? [];

	const workerColumns = useMemo(
		() =>
			workerHelper.columns([
				workerHelper.accessor(
					(row) => formatPerson(row.profile.fullName, row.profile.email),
					{
						id: "name",
						header: "Worker",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				workerHelper.accessor((row) => row.profile.email, {
					id: "email",
					header: "Email",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
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
					cell: ({ getValue }) => {
						const count = getValue();
						return `${count} ${count === 1 ? "location" : "locations"}`;
					},
				}),
				workerHelper.accessor((row) => row.hourlyWageCents, {
					id: "wage",
					header: "Wage",
					cell: ({ getValue }) => {
						const cents = getValue();
						return cents != null ? `$${(cents / 100).toFixed(2)}/hr` : "—";
					},
				}),
				workerHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const worker = row.original;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									nativeButton={false}
									render={
										<Link
											to="/dashboard/workers/$employmentId"
											params={{ employmentId: worker.employmentId }}
										/>
									}
								>
									Employment
								</Button>
								<AlertDialog>
									<AlertDialogTrigger
										render={
											<Button
												variant="outline"
												size="sm"
												disabled={deactivate.isPending}
											/>
										}
									>
										Deactivate
									</AlertDialogTrigger>
									<AlertDialogContent size="sm">
										<AlertDialogHeader>
											<AlertDialogMedia>
												<UsersIcon />
											</AlertDialogMedia>
											<AlertDialogTitle>Remove this person?</AlertDialogTitle>
											<AlertDialogDescription>
												{worker.profile.email} will lose access to this
												workplace.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												variant="destructive"
												onClick={() => deactivate.mutate(worker.employmentId)}
											>
												Deactivate
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						);
					},
				}),
			]),
		[deactivate, formatPerson],
	);

	return (
		<section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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

				<header className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-heading font-medium text-sm">Active team</h2>
							<Badge variant="secondary">{activeWorkers.length} active</Badge>
						</div>
						<p className="text-muted-foreground text-xs/relaxed">
							People with active access to this workplace.
						</p>
					</div>
				</header>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{workers.isLoading ? (
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="h-12" />
							<Skeleton className="h-12" />
							<Skeleton className="h-12" />
						</div>
					) : (
						<DataTable
							fill={false}
							columns={workerColumns}
							data={activeWorkers}
							getRowId={(row) => row.employmentId}
							empty={
								<div className="p-4">
									<Empty className="border border-dashed">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<UsersIcon />
											</EmptyMedia>
											<EmptyTitle>No workers yet</EmptyTitle>
											<EmptyDescription>
												Send your first invitation to bring someone onto the
												team.
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								</div>
							}
						/>
					)}

					<Invitations
						workplaceId={workplace?.id}
						invitations={invitations}
						onResend={(id) => resend.mutate(id)}
						onRevoke={(id) => revoke.mutate(id)}
					/>
				</div>
			</div>

			<aside className="flex max-h-[45vh] min-h-0 w-full shrink-0 flex-col overflow-y-auto border-t bg-muted/20 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
				<section className="flex flex-col gap-4 border-b p-4">
					<div>
						<h2 className="font-heading font-medium text-sm">Invite a worker</h2>
						<p className="text-muted-foreground text-xs/relaxed">
							We’ll email the invitation automatically. You can also copy the
							invite link after sending.
						</p>
					</div>
					<form id="invite-form" onSubmit={submitInvite}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="invite-email">Email</FieldLabel>
								<Input
									id="invite-email"
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="worker@example.com"
									required
								/>
							</Field>
							<Field>
								<FieldTitle id="invite-kind">They are a…</FieldTitle>
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
									aria-labelledby="invite-kind"
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
					<Button
						className="w-full"
						form="invite-form"
						type="submit"
						disabled={invite.isPending}
					>
						{invite.isPending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<UserPlusIcon data-icon="inline-start" />
						)}
						{invite.isPending ? "Inviting…" : "Send invitation"}
					</Button>
				</section>

				<section className="flex flex-col gap-4 p-4">
					<div>
						<h2 className="font-heading font-medium text-sm">Import your team</h2>
						<p className="text-muted-foreground text-xs/relaxed">
							CSV columns: name, email, phone, position, location. Names must
							match Settings.
						</p>
					</div>
					<Input
						type="file"
						accept=".csv,text/csv"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void readCsv(file);
						}}
					/>
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
					<Button
						className="w-full"
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
				</section>
			</aside>
		</section>
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
};

function Invitations({
	workplaceId,
	invitations,
	onResend,
	onRevoke,
}: {
	workplaceId?: string;
	invitations: InvitationDto[];
	onResend: (id: string) => void;
	onRevoke: (id: string) => void;
}) {
	const deliveryQuery = useQuery({
		queryKey: ["workplaces", workplaceId, "email-deliveries"],
		enabled: Boolean(workplaceId) && invitations.length > 0,
		queryFn: () =>
			api<{ deliveries: InvitationEmailDelivery[] }>(
				`/v1/workplaces/${workplaceId}/email-deliveries`,
			),
		refetchInterval: 15_000,
	});
	const latestDeliveries = new Map<string, InvitationEmailDelivery>();
	for (const delivery of deliveryQuery.data?.deliveries ?? []) {
		if (!latestDeliveries.has(delivery.invitationId))
			latestDeliveries.set(delivery.invitationId, delivery);
	}

	const columns = useMemo(
		() =>
			invitationHelper.columns([
				invitationHelper.accessor("email", {
					header: "Email",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
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
					cell: ({ getValue }) =>
						new Date(getValue()).toLocaleDateString(),
				}),
				invitationHelper.display({
					id: "emailStatus",
					header: "Email delivery",
					enableSorting: false,
					cell: ({ row }) => {
						const delivery = latestDeliveries.get(row.original.id);
						return (
							<div className="flex flex-col gap-1">
								<Badge
									variant={
										delivery?.status === "failed" ||
										delivery?.status === "bounced"
											? "destructive"
											: "outline"
									}
								>
									{delivery
										? `Email: ${delivery.status}`
										: deliveryQuery.isPending
											? "Loading email status…"
											: deliveryQuery.isError
												? "Email status unavailable"
												: "No recent email record"}
								</Badge>
								{delivery ? (
									<span className="text-muted-foreground text-xs">
										{delivery.attempts}{" "}
										{delivery.attempts === 1 ? "attempt" : "attempts"}
										{delivery.status === "queued" && delivery.attempts > 0
											? ` · Retry after ${new Date(delivery.availableAt).toLocaleString()}`
											: ""}
									</span>
								) : null}
							</div>
						);
					},
				}),
				invitationHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const invitation = row.original;
						const isPending =
							invitation.status === "pending" &&
							new Date(invitation.expiresAt).getTime() > Date.now();
						if (!isPending) return null;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								{invitation.token ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											navigator.clipboard
												.writeText(inviteLink(invitation.token ?? ""))
												.then(() => toast.success("Invite link copied."))
												.catch(() => toast.error("Copy failed."));
										}}
									>
										<CopyIcon data-icon="inline-start" />
										Copy link
									</Button>
								) : null}
								<Button
									variant="outline"
									size="sm"
									onClick={() => onResend(invitation.id)}
								>
									Resend
								</Button>
								<AlertDialog>
									<AlertDialogTrigger
										render={<Button variant="ghost" size="sm" />}
									>
										Revoke
									</AlertDialogTrigger>
									<AlertDialogContent size="sm">
										<AlertDialogHeader>
											<AlertDialogTitle>
												Revoke this invitation?
											</AlertDialogTitle>
											<AlertDialogDescription>
												The invite link for {invitation.email} will stop
												working.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												variant="destructive"
												onClick={() => onRevoke(invitation.id)}
											>
												Revoke
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						);
					},
				}),
			]),
		[
			deliveryQuery.isError,
			deliveryQuery.isPending,
			latestDeliveries,
			onResend,
			onRevoke,
		],
	);

	if (invitations.length === 0) return null;

	return (
		<section className="border-t">
			<header className="flex flex-col gap-1 border-b px-4 py-3">
				<h2 className="font-heading font-medium text-sm">Invitations</h2>
				<p className="text-muted-foreground text-xs/relaxed">
					Outstanding and past invite links. Email status refreshes every 15
					seconds; sent does not confirm delivery.
				</p>
				{deliveryQuery.isError ? (
					<p role="status">
						Email status is unavailable.{" "}
						<Button
							type="button"
							variant="link"
							onClick={() => void deliveryQuery.refetch()}
						>
							Try again
						</Button>
					</p>
				) : null}
			</header>
			<DataTable
				fill={false}
				columns={columns}
				data={invitations}
				getRowId={(row) => row.id}
			/>
		</section>
	);
}
