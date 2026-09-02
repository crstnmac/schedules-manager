import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { env } from "@SchedulesManager/env/web";
import { useAuth } from "@/lib/auth";
import { currentCoords } from "@/lib/coords";
import { useLocations, useMe } from "@/lib/queries";

export const Route = createFileRoute("/kiosk")({
	component: KioskPage,
});

function KioskPage() {
	const { user } = useAuth();
	const me = useMe(Boolean(user));
	const workplaceId = me.data?.employments.find(
		(row) => row.kind === "manager",
	)?.workplace.id;
	const locations = useLocations(workplaceId);
	const [locationId, setLocationId] = useState("");
	const [locationPin, setLocationPin] = useState("");
	const [workerPin, setWorkerPin] = useState("");

	async function clock(action: "in" | "out") {
		const coords = await currentCoords();
		const response = await fetch(`${env.VITE_SERVER_URL}/v1/kiosk/clock`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				locationId: locationId || locations.data?.[0]?.id,
				locationPin,
				workerPin,
				action,
				...coords,
			}),
		});
		const payload = (await response.json()) as { message?: string };
		if (!response.ok) {
			toast.error(payload.message ?? "Kiosk clock failed");
			return;
		}
		toast.success(action === "in" ? "Clocked in" : "Clocked out");
		setWorkerPin("");
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
					{(locations.data ?? []).length > 0 ? (
						<Select
							items={(locations.data ?? []).map((location) => ({
								label: location.name,
								value: location.id,
							}))}
							value={locationId || null}
							onValueChange={(value) => {
								if (value) setLocationId(value);
							}}
						>
							<SelectTrigger className="w-full">
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
					) : (
						<Input
							placeholder="Location ID"
							value={locationId}
							onChange={(event) => setLocationId(event.target.value)}
						/>
					)}
					<Input
						inputMode="numeric"
						placeholder="Location PIN"
						value={locationPin}
						onChange={(event) => setLocationPin(event.target.value)}
					/>
					<Input
						inputMode="numeric"
						placeholder="Worker PIN"
						value={workerPin}
						onChange={(event) => setWorkerPin(event.target.value)}
					/>
					<div className="grid grid-cols-2 gap-2">
						<Button onClick={() => void clock("in")}>Clock in</Button>
						<Button variant="outline" onClick={() => void clock("out")}>
							Clock out
						</Button>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
