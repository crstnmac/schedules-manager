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
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { CurrentProfile } from "@/components/current-profile";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMe, usePendingInvitations } from "@/lib/queries";

export const Route = createFileRoute("/onboarding")({
	component: OnboardingComponent,
});

interface SetupResponse {
	workplace: { id: string; name: string };
	location: { id: string; name: string; timezone: string };
	position: { id: string; name: string };
}

function OnboardingComponent() {
	const { user } = useAuth();
	const me = useMe(Boolean(user));
	const pending = usePendingInvitations(Boolean(user));
	const queryClient = useQueryClient();

	const [workplaceName, setWorkplaceName] = useState("");
	const [locationName, setLocationName] = useState("");
	const [positionName, setPositionName] = useState("");

	const setup = useMutation({
		mutationFn: () =>
			api<SetupResponse>("/v1/workplaces", {
				method: "POST",
				body: {
					name: workplaceName.trim(),
					location: {
						name: locationName.trim(),
						timezone: "America/Chicago",
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

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setup.mutate();
	}

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="grid min-h-svh place-items-center bg-muted/35 px-4 py-10"
		>
			<h1 className="sr-only">Set up your workplace</h1>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Set up your workplace</CardTitle>
					<CardDescription>
						Managers create the workplace here. Workers join with an invite link
						instead.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					{me.data?.profile ? (
						<CurrentProfile profile={me.data.profile} />
					) : null}
					<form id="onboarding-form" onSubmit={submit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="workplace">Workplace name</FieldLabel>
								<Input
									id="workplace"
									value={workplaceName}
									onChange={(event) => setWorkplaceName(event.target.value)}
									placeholder="Salsa Rocha Restaurant Group"
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="location">First Location</FieldLabel>
								<Input
									id="location"
									value={locationName}
									onChange={(event) => setLocationName(event.target.value)}
									placeholder="South Congress"
									required
								/>
								<FieldDescription>
									Time zone is set to America/Chicago for Austin restaurants.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="position">First Position</FieldLabel>
								<Input
									id="position"
									value={positionName}
									onChange={(event) => setPositionName(event.target.value)}
									placeholder="Server"
									required
								/>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
				<CardFooter>
					<Button
						className="w-full"
						form="onboarding-form"
						type="submit"
						disabled={setup.isPending}
					>
						{setup.isPending ? <Spinner data-icon="inline-start" /> : null}
						{setup.isPending ? "Creating…" : "Create workplace"}
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
