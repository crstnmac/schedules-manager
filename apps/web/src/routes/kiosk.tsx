import { env } from "@SchedulesManager/env/web";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
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
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { currentCoords } from "@/lib/coords";
import { resolveSelectedLocationId } from "@/lib/kiosk";
import { useLocations, useMe } from "@/lib/queries";

export const Route = createFileRoute("/kiosk")({
	component: KioskPage,
});

function KioskPage() {
	const { user } = useAuth();
	const me = useMe(Boolean(user));
	const workplaceId = me.data?.employments.find((row) => row.kind === "manager")
		?.workplace.id;
	const locations = useLocations(workplaceId);
	const [locationId, setLocationId] = useState("");
	const [locationPin, setLocationPin] = useState("");
	const [workerPin, setWorkerPin] = useState("");
	const [lastResult, setLastResult] = useState<{
		kind: "success" | "error";
		text: string;
	} | null>(null);

	const [pendingAction, setPendingAction] = useState<"in" | "out" | null>(null);
	const activeLocationId = selectedLocationId;
	const canClock =
		Boolean(activeLocationId) &&
		locationPin.length >= 4 &&
		workerPin.length >= 4 &&
		!pendingAction;
	useEffect(() => {
		document.title = "Location kiosk · jooling";
	}, []);

	async function clock(action: "in" | "out") {
		if (!canClock) return;
		setPendingAction(action);
		try {
			const coords = await currentCoords();
			const response = await fetch(`${env.VITE_SERVER_URL}/v1/kiosk/clock`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					locationId: activeLocationId,
					locationPin,
					workerPin,
					action,
					...coords,
				}),
			});
			const payload = (await response.json()) as { message?: string };
			if (!response.ok) {
				const text = payload.message ?? "Kiosk clock failed";
				setLastResult({ kind: "error", text });
				toast.error(text);
				return;
			}
			const text =
				action === "in"
					? `Clocked in at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
					: `Clocked out at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
			setLastResult({ kind: "success", text });
			toast.success(action === "in" ? "Clocked in" : "Clocked out");
			setWorkerPin("");
		} catch {
			const text =
				"Couldn’t reach the time clock. Check your connection and try again.";
			setLastResult({ kind: "error", text });
			toast.error(text);
		} finally {
			setPendingAction(null);
		}
	}

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6"
		>
			<Card>
				<CardHeader>
					<CardTitle>Location Kiosk</CardTitle>
					<CardDescription>
						Enter the Location PIN, then the Worker PIN. No personal sign-in.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3">
					{locations.isError ? (
						<Alert variant="destructive">
							<AlertTitle>Couldn’t load locations</AlertTitle>
							<AlertDescription className="flex flex-wrap items-center gap-2">
								<span>Check the connection, then try again.</span>
								<Button
									size="sm"
									variant="outline"
									disabled={locations.isFetching}
									onClick={() => void locations.refetch()}
								>
									{locations.isFetching ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Try again
								</Button>
							</AlertDescription>
						</Alert>
					) : null}
					{(locations.data ?? []).length === 0 && locations.isSuccess ? (
						<Alert>
							<AlertTitle>No locations set up</AlertTitle>
							<AlertDescription>
								A manager needs to add a location for this workplace before this
								kiosk can be used.
							</AlertDescription>
						</Alert>
					) : null}
					{lastResult ? (
						<p
							role="status"
							className={
								lastResult.kind === "success"
									? "rounded-md border border-primary/30 bg-primary/10 px-3 py-2 font-medium text-sm"
									: "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-medium text-sm"
							}
						>
							{lastResult.text}
						</p>
					) : null}
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void clock("in");
						}}
						className="grid gap-3"
					>
						<Field>
							<FieldLabel htmlFor="kiosk-location">Location</FieldLabel>
							{(locations.data ?? []).length > 0 ? (
								<Select
									items={(locations.data ?? []).map((location) => ({
										label: location.name,
										value: location.id,
									}))}
									value={activeLocationId || null}
									onValueChange={(value) => {
										if (value) setLocationId(value);
									}}
								>
									<SelectTrigger id="kiosk-location" className="w-full">
										<SelectValue placeholder="Select Location" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{(locations.data ?? []).map((location) => (
												<SelectItem key={location.id} value={location.id}>
													{location.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							) : null}
						</Field>
						<Field>
							<FieldLabel htmlFor="kiosk-location-pin">Location PIN</FieldLabel>
							<Input
								id="kiosk-location-pin"
								type="password"
								maxLength={8}
								autoComplete="off"
								inputMode="numeric"
								placeholder="4–8 digits"
								value={locationPin}
								onChange={(event) => setLocationPin(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="kiosk-worker-pin">
								Your worker PIN
							</FieldLabel>
							<Input
								id="kiosk-worker-pin"
								type="password"
								maxLength={8}
								autoComplete="off"
								inputMode="numeric"
								placeholder="4–8 digits"
								value={workerPin}
								onChange={(event) => setWorkerPin(event.target.value)}
							/>
						</Field>
						<div className="grid grid-cols-2 gap-2">
							<Button type="submit" disabled={!canClock}>
								{pendingAction === "in" ? "Clocking in…" : "Clock in"}
							</Button>
							<Button
								type="button"
								disabled={!canClock}
								variant="outline"
								onClick={() => void clock("out")}
							>
								{pendingAction === "out" ? "Clocking out…" : "Clock out"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
