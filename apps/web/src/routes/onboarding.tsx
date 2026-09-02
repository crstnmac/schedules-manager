import { Alert, AlertDescription } from "@SchedulesManager/ui/components/alert";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { StoreIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddressSearch } from "@/components/address-search";
import { AuthShell } from "@/components/auth-shell";
import { CurrentProfile } from "@/components/current-profile";
import { TimezoneSelect } from "@/components/timezone-select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
	type MeProfile,
	useAcceptInvitation,
	useMe,
	usePendingInvitations,
} from "@/lib/queries";

export const Route = createFileRoute("/onboarding")({
	component: OnboardingComponent,
});

type SetupPath = "choose" | "manager" | "worker";

interface SetupResponse {
	workplace: { id: string; name: string };
	location: { id: string; name: string; timezone: string };
	position: { id: string; name: string };
}

const invitationTokenPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invitationTokenFromInput(value: string): string | null {
	const token = value.trim().split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	return invitationTokenPattern.test(token) ? token : null;
}

function OnboardingComponent() {
	const { user } = useAuth();
	const me = useMe(Boolean(user));
	const pending = usePendingInvitations(Boolean(user));
	const [setupPath, setSetupPath] = useState<SetupPath>("choose");

	if (!user) return <Navigate to="/" replace />;
	if (me.isLoading || pending.isLoading) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
				<span className="sr-only">Loading</span>
			</main>
		);
	}
	if (me.data && me.data.employments.length > 0) {
		return <Navigate to="/" replace />;
	}
	if ((pending.data?.invitations.length ?? 0) > 0) {
		return <Navigate to="/join" replace />;
	}

	if (setupPath === "manager") {
		return (
			<WorkplaceSetup
				profile={me.data?.profile}
				onBack={() => setSetupPath("choose")}
			/>
		);
	}
	if (setupPath === "worker") {
		return (
			<WaitingForInvite
				profile={me.data?.profile}
				onBack={() => setSetupPath("choose")}
			/>
		);
	}

	return (
		<OnboardingChoice profile={me.data?.profile} onChoose={setSetupPath} />
	);
}

function OnboardingChoice({
	profile,
	onChoose,
}: {
	profile?: MeProfile;
	onChoose: (path: "manager" | "worker") => void;
}) {
	const { signOut } = useAuth();

	return (
		<AuthShell>
			<h1 className="sr-only">How are you joining?</h1>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>How are you joining?</CardTitle>
					<CardDescription>
						Managers create the first workplace. Workers wait for an invitation
						instead of opening a workplace by accident.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{profile ? <CurrentProfile profile={profile} /> : null}
					<ItemGroup>
						<Item
							variant="outline"
							render={<button type="button" />}
							className="cursor-pointer text-left hover:bg-muted/50"
							onClick={() => onChoose("worker")}
						>
							<ItemMedia variant="icon">
								<UsersIcon />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>I&apos;m a team member</ItemTitle>
								<ItemDescription>
									Join a workplace using the invitation from your manager.
								</ItemDescription>
							</ItemContent>
						</Item>
						<Item
							variant="outline"
							render={<button type="button" />}
							className="cursor-pointer text-left hover:bg-muted/50"
							onClick={() => onChoose("manager")}
						>
							<ItemMedia variant="icon">
								<StoreIcon />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>I manage a workplace</ItemTitle>
								<ItemDescription>
									Create a new workplace and invite your team.
								</ItemDescription>
							</ItemContent>
						</Item>
					</ItemGroup>
				</CardContent>
				<CardFooter>
					<Button
						className="w-full"
						variant="outline"
						onClick={() => void signOut()}
					>
						Sign out
					</Button>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}

function WaitingForInvite({
	profile,
	onBack,
}: {
	profile?: MeProfile;
	onBack: () => void;
}) {
	const pending = usePendingInvitations(true);
	const accept = useAcceptInvitation();
	const [invite, setInvite] = useState("");
	const token = invitationTokenFromInput(invite);

	async function checkForInvitation() {
		const result = await pending.refetch();
		if ((result.data?.invitations.length ?? 0) === 0) {
			toast.message("No invitation yet for this email.");
		}
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token) return;
		accept.mutate(token);
	}

	return (
		<AuthShell>
			<h1 className="sr-only">Join your workplace</h1>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Join your workplace</CardTitle>
					<CardDescription>
						Ask your manager to invite this account&apos;s email. New
						invitations appear automatically, or paste an invite link.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{profile ? <CurrentProfile profile={profile} /> : null}
					<form id="join-invite-form" onSubmit={submit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="invite">Invite link or code</FieldLabel>
								<Input
									id="invite"
									value={invite}
									onChange={(event) => setInvite(event.target.value)}
									placeholder="Paste invitation link or code"
									autoCapitalize="off"
									autoCorrect="off"
									spellCheck={false}
								/>
								<FieldDescription>
									Use the email your manager invited. The link is unique to you.
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
					{accept.isError ? (
						<Alert variant="destructive">
							<AlertDescription>
								{(accept.error as Error).message}
							</AlertDescription>
						</Alert>
					) : null}
				</CardContent>
				<CardFooter className="flex-col gap-2">
					<Button
						className="w-full"
						form="join-invite-form"
						type="submit"
						disabled={!token || accept.isPending}
					>
						{accept.isPending ? <Spinner data-icon="inline-start" /> : null}
						{accept.isPending ? "Joining…" : "Join workplace"}
					</Button>
					<Button
						className="w-full"
						variant="outline"
						disabled={pending.isFetching}
						onClick={() => void checkForInvitation()}
					>
						{pending.isFetching ? <Spinner data-icon="inline-start" /> : null}
						{pending.isFetching ? "Checking…" : "Check for invitation"}
					</Button>
					<Button className="w-full" variant="ghost" onClick={onBack}>
						Back
					</Button>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}

function WorkplaceSetup({
	profile,
	onBack,
}: {
	profile?: MeProfile;
	onBack: () => void;
}) {
	const queryClient = useQueryClient();
	const [workplaceName, setWorkplaceName] = useState("");
	const [locationName, setLocationName] = useState("");
	const [locationAddress, setLocationAddress] = useState("");
	const [locationLatitude, setLocationLatitude] = useState("");
	const [locationLongitude, setLocationLongitude] = useState("");
	const [timezone, setTimezone] = useState("America/Chicago");
	const [positionName, setPositionName] = useState("");

	const setup = useMutation({
		mutationFn: () =>
			api<SetupResponse>("/v1/workplaces", {
				method: "POST",
				body: {
					name: workplaceName.trim(),
					location: {
						name: locationName.trim(),
						timezone,
						addressLine: locationAddress.trim() || undefined,
						latitude: locationLatitude || undefined,
						longitude: locationLongitude || undefined,
					},
					position: { name: positionName.trim() },
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["me"] });
			toast.success(`${data.workplace.name} is ready.`);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setup.mutate();
	}

	return (
		<AuthShell>
			<h1 className="sr-only">Set up your workplace</h1>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Set up your workplace</CardTitle>
					<CardDescription>
						Create the first workplace, location, and position. Workers join
						through an invite instead.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					{profile ? <CurrentProfile profile={profile} /> : null}
					<form id="onboarding-form" onSubmit={submit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="workplace">Workplace name</FieldLabel>
								<Input
									id="workplace"
									value={workplaceName}
									onChange={(event) => setWorkplaceName(event.target.value)}
									placeholder="Northside Operations"
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="location">First location</FieldLabel>
								<Input
									id="location"
									value={locationName}
									onChange={(event) => setLocationName(event.target.value)}
									placeholder="South Congress"
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="location-address">
									Address (optional)
								</FieldLabel>
								<AddressSearch
									id="location-address"
									value={locationAddress}
									onValueChange={setLocationAddress}
									onSelect={(place) => {
										setLocationAddress(place.addressLine);
										setLocationLatitude(place.latitude);
										setLocationLongitude(place.longitude);
										if (place.timezone) setTimezone(place.timezone);
										if (!locationName.trim() && place.name) {
											setLocationName(place.name);
										}
									}}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="location-timezone">Time zone</FieldLabel>
								<TimezoneSelect
									id="location-timezone"
									value={timezone}
									onValueChange={setTimezone}
								/>
								<FieldDescription>
									Used for shift times at this Location. You can change the
									Geofence later in settings.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="position">First position</FieldLabel>
								<Input
									id="position"
									value={positionName}
									onChange={(event) => setPositionName(event.target.value)}
									placeholder="Associate"
									required
								/>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
				<CardFooter className="flex-col gap-2">
					<Button
						className="w-full"
						form="onboarding-form"
						type="submit"
						disabled={setup.isPending}
					>
						{setup.isPending ? <Spinner data-icon="inline-start" /> : null}
						{setup.isPending ? "Creating…" : "Create workplace"}
					</Button>
					<Button className="w-full" variant="ghost" onClick={onBack}>
						Back
					</Button>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}
