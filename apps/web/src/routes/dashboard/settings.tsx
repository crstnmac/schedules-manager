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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPinIcon, TagsIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import {
	type LocationDto,
	type PositionDto,
	useLocations,
	usePositions,
	useWorkplaceSettings,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

const AUSTIN_TIMEZONES = [
	"America/Chicago",
	"America/New_York",
	"America/Denver",
	"America/Phoenix",
	"America/Los_Angeles",
];

const TIMEZONE_ITEMS = AUSTIN_TIMEZONES.map((tz) => ({
	label: tz,
	value: tz,
}));

export const Route = createFileRoute("/dashboard/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const settings = useWorkplaceSettings(workplace?.id);
	const queryClient = useQueryClient();

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplace?.id, "locations"],
		});
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplace?.id, "positions"],
		});
	}

	return (
		<section className="flex flex-col gap-6">
			<PageHeader
				title="Settings"
				description="Workplace details, locations, and positions used when drafting the schedule."
			/>
			<div className="grid gap-6 lg:grid-cols-2">
				<WorkplaceCard
					settings={settings.data}
					isLoading={settings.isLoading}
					onChange={() =>
						queryClient.invalidateQueries({
							queryKey: ["workplace-settings", workplace?.id],
						})
					}
				/>
				<LocationsCard
					locations={locations.data ?? []}
					isLoading={locations.isLoading}
					onChange={invalidate}
				/>
				<PositionsCard
					positions={positions.data ?? []}
					isLoading={positions.isLoading}
					onChange={invalidate}
				/>
			</div>
		</section>
	);
}

function WorkplaceCard({
	settings,
	isLoading,
	onChange,
}: {
	settings: { id: string; name: string; noticeWindowHours: number } | undefined;
	isLoading: boolean;
	onChange: () => void;
}) {
	const [name, setName] = useState<string | null>(null);
	const [hours, setHours] = useState<number | null>(null);
	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${settings?.id}`, {
				method: "PATCH",
				body: {
					name: name ?? settings?.name,
					noticeWindowHours: hours ?? settings?.noticeWindowHours,
				},
			}),
		onSuccess: () => {
			onChange();
			toast.success("Workplace settings saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<CardTitle>Workplace</CardTitle>
				<CardDescription>
					Name and the notice window for late material changes.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading || !settings ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<Skeleton className="h-16" />
						<Skeleton className="h-16" />
					</div>
				) : (
					<FieldGroup className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="workplace-name">Workplace name</FieldLabel>
							<Input
								id="workplace-name"
								defaultValue={settings.name}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="notice-window">
								Notice window (hours)
							</FieldLabel>
							<Input
								id="notice-window"
								type="number"
								min={0}
								max={336}
								defaultValue={settings.noticeWindowHours}
								onChange={(event) => setHours(Number(event.target.value))}
							/>
							<FieldDescription>
								Material changes published inside this window before a shift
								require the worker's explicit acceptance.
							</FieldDescription>
						</Field>
					</FieldGroup>
				)}
			</CardContent>
			<CardFooter>
				<Button
					disabled={save.isPending || !settings}
					onClick={() => save.mutate()}
				>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					{save.isPending ? "Saving…" : "Save settings"}
				</Button>
			</CardFooter>
		</Card>
	);
}

function LocationsCard({
	locations,
	isLoading,
	onChange,
}: {
	locations: LocationDto[];
	isLoading: boolean;
	onChange: () => void;
}) {
	const { workplace } = useWorkplace();
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState("America/Chicago");
	const [addressLine, setAddressLine] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editTimezone, setEditTimezone] = useState("America/Chicago");

	const create = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/locations`, {
				method: "POST",
				body: {
					name: name.trim(),
					timezone,
					addressLine: addressLine || undefined,
				},
			}),
		onSuccess: () => {
			setName("");
			setAddressLine("");
			onChange();
			toast.success("Location added.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const update = useMutation({
		mutationFn: (input: { id: string; name: string; timezone: string }) =>
			api(`/v1/locations/${input.id}`, {
				method: "PATCH",
				body: { name: input.name, timezone: input.timezone },
			}),
		onSuccess: () => {
			setEditingId(null);
			onChange();
			toast.success("Location updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		create.mutate();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Locations</CardTitle>
				<CardDescription>
					Restaurants and sites workers can be scheduled at.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading ? (
					<Skeleton className="h-16" />
				) : locations.length === 0 ? (
					<Empty className="border border-dashed">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<MapPinIcon />
							</EmptyMedia>
							<EmptyTitle>No locations yet</EmptyTitle>
							<EmptyDescription>
								Add the first restaurant or site below.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<ItemGroup>
						{locations.map((location) => (
							<Item key={location.id} variant="outline" role="listitem">
								{editingId === location.id ? (
									<ItemContent>
										<FieldGroup>
											<Field>
												<FieldLabel htmlFor={`edit-location-${location.id}`}>
													Location name
												</FieldLabel>
												<Input
													id={`edit-location-${location.id}`}
													value={editName}
													onChange={(event) => setEditName(event.target.value)}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor={`edit-timezone-${location.id}`}>
													Time zone
												</FieldLabel>
												<Select
													items={TIMEZONE_ITEMS}
													value={editTimezone}
													onValueChange={(value) => {
														if (!value) return;
														setEditTimezone(value);
													}}
												>
													<SelectTrigger
														id={`edit-timezone-${location.id}`}
														className="w-full"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent alignItemWithTrigger={false}>
														<SelectGroup>
															{TIMEZONE_ITEMS.map((item) => (
																<SelectItem key={item.value} value={item.value}>
																	{item.label}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
											</Field>
										</FieldGroup>
										<ItemActions className="mt-2">
											<Button
												size="sm"
												disabled={update.isPending}
												onClick={() =>
													update.mutate({
														id: location.id,
														name: editName.trim() || location.name,
														timezone: editTimezone,
													})
												}
											>
												{update.isPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												Save
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setEditingId(null)}
											>
												Cancel
											</Button>
										</ItemActions>
									</ItemContent>
								) : (
									<>
										<ItemContent>
											<ItemTitle>{location.name}</ItemTitle>
											<ItemDescription>
												{location.timezone}
												{location.addressLine
													? ` · ${location.addressLine}`
													: ""}
											</ItemDescription>
										</ItemContent>
										<ItemActions>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													setEditingId(location.id);
													setEditName(location.name);
													setEditTimezone(location.timezone);
												}}
											>
												Edit
											</Button>
										</ItemActions>
									</>
								)}
							</Item>
						))}
					</ItemGroup>
				)}
				<form onSubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="location-name">Location name</FieldLabel>
							<Input
								id="location-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Domain"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="location-address">
								Address (optional)
							</FieldLabel>
							<Input
								id="location-address"
								value={addressLine}
								onChange={(event) => setAddressLine(event.target.value)}
								placeholder="4400 N Lamar Blvd, Austin, TX"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="location-timezone">Time zone</FieldLabel>
							<Select
								items={TIMEZONE_ITEMS}
								value={timezone}
								onValueChange={(value) => {
									if (!value) return;
									setTimezone(value);
								}}
							>
								<SelectTrigger id="location-timezone" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									<SelectGroup>
										{TIMEZONE_ITEMS.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? <Spinner data-icon="inline-start" /> : null}
							{create.isPending ? "Adding…" : "Add location"}
						</Button>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}

function PositionsCard({
	positions,
	isLoading,
	onChange,
}: {
	positions: PositionDto[];
	isLoading: boolean;
	onChange: () => void;
}) {
	const { workplace } = useWorkplace();
	const [name, setName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");

	const create = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/positions`, {
				method: "POST",
				body: { name: name.trim() },
			}),
		onSuccess: () => {
			setName("");
			onChange();
			toast.success("Position added.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const update = useMutation({
		mutationFn: (input: { id: string; name: string }) =>
			api(`/v1/positions/${input.id}`, {
				method: "PATCH",
				body: { name: input.name },
			}),
		onSuccess: () => {
			setEditingId(null);
			onChange();
			toast.success("Position updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		create.mutate();
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Positions</CardTitle>
				<CardDescription>
					Roles workers can be scheduled into, like Server or Cook.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading ? (
					<Skeleton className="h-16" />
				) : positions.length === 0 ? (
					<Empty className="border border-dashed">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<TagsIcon />
							</EmptyMedia>
							<EmptyTitle>No positions yet</EmptyTitle>
							<EmptyDescription>Add the first role below.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<ItemGroup>
						{positions.map((position) => (
							<Item key={position.id} variant="outline" role="listitem">
								{editingId === position.id ? (
									<ItemContent>
										<FieldGroup>
											<Field>
												<FieldLabel htmlFor={`edit-position-${position.id}`}>
													Position name
												</FieldLabel>
												<Input
													id={`edit-position-${position.id}`}
													value={editName}
													onChange={(event) => setEditName(event.target.value)}
												/>
											</Field>
										</FieldGroup>
										<ItemActions className="mt-2">
											<Button
												size="sm"
												disabled={update.isPending}
												onClick={() =>
													update.mutate({
														id: position.id,
														name: editName.trim() || position.name,
													})
												}
											>
												{update.isPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												Save
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setEditingId(null)}
											>
												Cancel
											</Button>
										</ItemActions>
									</ItemContent>
								) : (
									<>
										<ItemContent>
											<ItemTitle>{position.name}</ItemTitle>
										</ItemContent>
										<ItemActions>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													setEditingId(position.id);
													setEditName(position.name);
												}}
											>
												Rename
											</Button>
										</ItemActions>
									</>
								)}
							</Item>
						))}
					</ItemGroup>
				)}
				<form onSubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="position-name">Position name</FieldLabel>
							<Input
								id="position-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Cook"
								required
							/>
						</Field>
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? <Spinner data-icon="inline-start" /> : null}
							{create.isPending ? "Adding…" : "Add position"}
						</Button>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
