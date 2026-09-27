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
import {
	Field,
	FieldError,
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
import { createFileRoute } from "@tanstack/react-router";
import { LogInIcon, LogOutIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LogoMark } from "@/components/logo-mark";
import { useAuth } from "@/lib/auth";
import { currentCoords } from "@/lib/coords";
import { resolveSelectedLocationId } from "@/lib/kiosk";
import { useLocations, useMe } from "@/lib/queries";

export const Route = createFileRoute("/kiosk")({
	component: KioskPage,
});

function useNow(intervalMs: number): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}

function KioskPage() {
	const now = useNow(10_000);
	const { user } = useAuth();
	const me = useMe(Boolean(user));
	const workplaceId = me.data?.employments.find((row) => row.kind === "manager")
		?.workplace.id;
	const locations = useLocations(workplaceId);
	const [locationId, setLocationId] = useState("");
	const [locationPin, setLocationPin] = useState("");
	const [workerPin, setWorkerPin] = useState("");
	const [attempted, setAttempted] = useState(false);
	const locationPinRef = useRef<HTMLInputElement>(null);
	const workerPinRef = useRef<HTMLInputElement>(null);
	const [lastResult, setLastResult] = useState<{
		kind: "success" | "error";
		text: string;
	} | null>(null);

	const [pendingAction, setPendingAction] = useState<"in" | "out" | null>(null);
	const selectedLocationId = resolveSelectedLocationId(
		locationId,
		locations.data,
	);
	const activeLocationId = selectedLocationId;
	const pinPattern = /^\d{4,8}$/;
	const locationError =
		attempted && !pinPattern.test(locationPin)
			? "Enter a 4–8 digit location PIN."
			: null;
	const workerError =
		attempted && !pinPattern.test(workerPin)
			? "Enter your 4–8 digit worker PIN."
			: null;
	useEffect(() => {
		document.title = "Location kiosk · jooling";
	}, []);

	async function clock(action: "in" | "out") {
		if (pendingAction) return;
		setAttempted(true);
		if (!activeLocationId) {
			setLastResult({ kind: "error", text: "Select a location first." });
			return;
		}
		if (!pinPattern.test(locationPin)) {
			locationPinRef.current?.focus();
			return;
		}
		if (!pinPattern.test(workerPin)) {
			workerPinRef.current?.focus();
			return;
		}
		setLastResult(null);
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
			className="flex min-h-svh flex-col bg-muted/50"
		>
			<header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-3 md:px-8">
				<div className="flex items-center gap-2.5">
					<LogoMark size={28} className="rounded-md" />
					<span className="font-heading font-semibold text-sm tracking-tight">
						Time clock
					</span>
				</div>
				<span className="text-muted-foreground text-sm">Shared kiosk</span>
			</header>
			<div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
				<div className="flex flex-col items-center gap-1 text-center">
					<time
						dateTime={now.toISOString()}
						className="font-heading font-semibold text-5xl tabular-nums tracking-tight md:text-6xl"
					>
						{now.toLocaleTimeString(undefined, {
							hour: "numeric",
							minute: "2-digit",
						})}
					</time>
					<p className="text-muted-foreground">
						{now.toLocaleDateString(undefined, {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
					</p>
				</div>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Clock in or out</CardTitle>
						<CardDescription>
							Enter the location PIN, then your worker PIN. No personal sign-in.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
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
							<Alert role="status">
								<AlertTitle>No locations set up</AlertTitle>
								<AlertDescription>
									A manager needs to add a location for this workplace before
									this kiosk can be used.
								</AlertDescription>
							</Alert>
						) : null}
						{lastResult ? (
							<Alert
								variant={
									lastResult.kind === "error" ? "destructive" : "default"
								}
								role={lastResult.kind === "error" ? "alert" : "status"}
							>
								<AlertDescription>{lastResult.text}</AlertDescription>
							</Alert>
						) : null}
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void clock("in");
							}}
							className="flex flex-col gap-3"
							noValidate
						>
							<FieldGroup>
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
											<SelectTrigger
												id="kiosk-location"
												className="h-11 w-full"
											>
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
								<Field data-invalid={Boolean(locationError)}>
									<FieldLabel htmlFor="kiosk-location-pin">
										Location PIN
									</FieldLabel>
									<Input
										ref={locationPinRef}
										id="kiosk-location-pin"
										type="password"
										maxLength={8}
										autoComplete="off"
										inputMode="numeric"
										placeholder="4–8 digits"
										className="h-11 text-base tracking-widest"
										value={locationPin}
										onChange={(event) => setLocationPin(event.target.value)}
										aria-invalid={Boolean(locationError)}
										aria-describedby={
											locationError ? "kiosk-location-pin-error" : undefined
										}
									/>
									{locationError ? (
										<FieldError id="kiosk-location-pin-error">
											{locationError}
										</FieldError>
									) : null}
								</Field>
								<Field data-invalid={Boolean(workerError)}>
									<FieldLabel htmlFor="kiosk-worker-pin">
										Your worker PIN
									</FieldLabel>
									<Input
										ref={workerPinRef}
										id="kiosk-worker-pin"
										type="password"
										maxLength={8}
										autoComplete="off"
										inputMode="numeric"
										placeholder="4–8 digits"
										className="h-11 text-base tracking-widest"
										value={workerPin}
										onChange={(event) => setWorkerPin(event.target.value)}
										aria-invalid={Boolean(workerError)}
										aria-describedby={
											workerError ? "kiosk-worker-pin-error" : undefined
										}
									/>
									{workerError ? (
										<FieldError id="kiosk-worker-pin-error">
											{workerError}
										</FieldError>
									) : null}
								</Field>
							</FieldGroup>
							<div className="grid grid-cols-2 gap-2 pt-1">
								<Button
									type="submit"
									size="lg"
									className="h-12 text-base"
									disabled={Boolean(pendingAction)}
								>
									<LogInIcon data-icon="inline-start" />
									{pendingAction === "in" ? "Clocking in…" : "Clock in"}
								</Button>
								<Button
									type="button"
									disabled={Boolean(pendingAction)}
									variant="outline"
									size="lg"
									className="h-12 text-base"
									onClick={() => void clock("out")}
								>
									<LogOutIcon data-icon="inline-start" />
									{pendingAction === "out" ? "Clocking out…" : "Clock out"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
