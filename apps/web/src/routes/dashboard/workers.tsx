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
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
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
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CopyIcon, LinkIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import {
	type InvitationDto,
	useLocations,
	usePositions,
	useWorkers,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/workers")({
	component: WorkersPage,
});

function WorkersPage() {
	const { workplace } = useWorkplace();
	const workers = useWorkers(workplace?.id);
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);

	const [email, setEmail] = useState("");
	const [kind, setKind] = useState<"worker" | "manager">("worker");
	const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
	const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
	const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

	const queryClient = useQueryClient();

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplace?.id, "workers"],
		});
		queryClient.invalidateQueries({ queryKey: ["me"] });
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
			toast.success("Invitation created. Share the invite link.");
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
			toast.success("Invitation refreshed.");
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
			toast.success("Access removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

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

	return (
		<section className="flex flex-col gap-6">
			<PageHeader
				title="Workers"
				description="Invite people to this workplace and manage who can be scheduled."
			/>
			<div className="grid gap-6 lg:grid-cols-[380px_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Invite a worker</CardTitle>
						<CardDescription>
							Email delivery is not configured yet, so share the invite link
							directly after inviting.
						</CardDescription>
					</CardHeader>
					<CardContent>
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
										<FieldGroup className="gap-3">
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
										<FieldGroup className="gap-3">
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
					</CardContent>
					<CardFooter>
						<Button
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
					</CardFooter>
				</Card>

				<div className="flex flex-col gap-6">
					{lastInviteToken ? (
						<Alert>
							<LinkIcon />
							<AlertTitle>Latest invite link</AlertTitle>
							<AlertDescription>
								<p className="mb-2">
									Share this link with the person you just invited.
								</p>
								<InputGroup>
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

					<Card>
						<CardHeader>
							<CardTitle>Team</CardTitle>
							<CardDescription>
								People with active access to this workplace.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{workers.isLoading ? (
								<div className="flex flex-col gap-3">
									<Skeleton className="h-16" />
									<Skeleton className="h-16" />
								</div>
							) : activeWorkers.length === 0 ? (
								<Empty className="border border-dashed">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<UsersIcon />
										</EmptyMedia>
										<EmptyTitle>No workers yet</EmptyTitle>
										<EmptyDescription>
											Send your first invitation to bring someone onto the team.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								<ItemGroup>
									{activeWorkers.map((worker) => (
										<Item
											key={worker.employmentId}
											variant="outline"
											role="listitem"
										>
											<ItemContent>
												<ItemTitle>
													{worker.profile.fullName ?? worker.profile.email}
													<Badge variant="outline" className="uppercase">
														{worker.kind}
													</Badge>
												</ItemTitle>
												<ItemDescription>
													{worker.profile.email} · {worker.locationIds.length}{" "}
													location(s)
												</ItemDescription>
											</ItemContent>
											<ItemActions>
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
															<AlertDialogTitle>
																Remove this person?
															</AlertDialogTitle>
															<AlertDialogDescription>
																{worker.profile.email} will lose access to this
																workplace.
															</AlertDialogDescription>
														</AlertDialogHeader>
														<AlertDialogFooter>
															<AlertDialogCancel>Cancel</AlertDialogCancel>
															<AlertDialogAction
																variant="destructive"
																onClick={() =>
																	deactivate.mutate(worker.employmentId)
																}
															>
																Deactivate
															</AlertDialogAction>
														</AlertDialogFooter>
													</AlertDialogContent>
												</AlertDialog>
											</ItemActions>
										</Item>
									))}
								</ItemGroup>
							)}
						</CardContent>
					</Card>

					<Invitations
						invitations={invitations}
						onResend={(id) => resend.mutate(id)}
						onRevoke={(id) => revoke.mutate(id)}
					/>
				</div>
			</div>
		</section>
	);
}

function inviteLink(token: string) {
	return `${window.location.origin}/invite/${token}`;
}

function Invitations({
	invitations,
	onResend,
	onRevoke,
}: {
	invitations: InvitationDto[];
	onResend: (id: string) => void;
	onRevoke: (id: string) => void;
}) {
	if (invitations.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Invitations</CardTitle>
				<CardDescription>Outstanding and past invite links.</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{invitations.map((invitation) => {
						const isPending =
							invitation.status === "pending" &&
							new Date(invitation.expiresAt).getTime() > Date.now();
						return (
							<Item key={invitation.id} variant="outline" role="listitem">
								<ItemContent>
									<ItemTitle>
										{invitation.email}
										<Badge
											className="uppercase"
											variant={
												invitation.status === "revoked"
													? "destructive"
													: invitation.status === "accepted"
														? "default"
														: "secondary"
											}
										>
											{invitation.status}
										</Badge>
									</ItemTitle>
									<ItemDescription>
										Expires{" "}
										{new Date(invitation.expiresAt).toLocaleDateString()}
									</ItemDescription>
								</ItemContent>
								{isPending ? (
									<ItemActions>
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
									</ItemActions>
								) : null}
							</Item>
						);
					})}
				</ItemGroup>
			</CardContent>
		</Card>
	);
}
