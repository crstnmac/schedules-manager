import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsSection } from "@/components/settings/page";
import { api } from "@/lib/api";
import { useLocations } from "@/lib/queries";

type SquareStatus =
	| { connected: false; mappings: []; squareLocations: [] }
	| {
			connected: true;
			merchantId: string;
			mappings: Array<{ locationId: string; squareLocationId: string }>;
			squareLocations: Array<{ id: string; name: string }>;
	  };

type PreviewRow = {
	date: string;
	amountCents: number;
	currentAmountCents: number | null;
	change: boolean;
};

export function SquareCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const queryClient = useQueryClient();
	const locations = useLocations(workplaceId);
	const status = useQuery({
		queryKey: ["square", workplaceId],
		queryFn: () =>
			api<SquareStatus>(`/v1/workplaces/${workplaceId}/integrations/square`),
		enabled: Boolean(workplaceId),
	});
	const [locationId, setLocationId] = useState("");
	const [squareLocationId, setSquareLocationId] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [overwrite, setOverwrite] = useState(false);
	const [preview, setPreview] = useState<PreviewRow[] | null>(null);
	const [reviewHash, setReviewHash] = useState("");
	const selectedLocationId = locationId || locations.data?.[0]?.id || "";
	const mappedSquareLocationId = status.data?.mappings.find(
		(mapping) => mapping.locationId === selectedLocationId,
	)?.squareLocationId;
	const selectedSquareLocationId =
		squareLocationId || mappedSquareLocationId || "";
	const validRange = Boolean(from && to && from <= to);

	const connect = useMutation({
		mutationFn: () =>
			api<{ url: string }>(
				`/v1/workplaces/${workplaceId}/integrations/square/connect`,
			),
		onSuccess: ({ url }) => {
			window.location.assign(url);
		},
		onError: (error) => toast.error(error.message),
	});
	const mapLocation = useMutation({
		mutationFn: () =>
			api(
				`/v1/workplaces/${workplaceId}/integrations/square/mappings/${selectedLocationId}`,
				{
					method: "PUT",
					body: { squareLocationId: selectedSquareLocationId },
				},
			),
		onSuccess: () => {
			setPreview(null);
			void queryClient.invalidateQueries({ queryKey: ["square", workplaceId] });
			toast.success("Square Location mapped");
		},
		onError: (error) => toast.error(error.message),
	});
	const previewImport = useMutation({
		mutationFn: () =>
			api<{ rows: PreviewRow[]; reviewHash: string }>(
				`/v1/workplaces/${workplaceId}/integrations/square/preview`,
				{
					method: "POST",
					body: { locationId: selectedLocationId, from, to },
				},
			),
		onSuccess: ({ rows, reviewHash: hash }) => {
			setPreview(rows);
			setReviewHash(hash);
			setOverwrite(false);
		},
		onError: (error) => toast.error(error.message),
	});
	const importSales = useMutation({
		mutationFn: () =>
			api<{ imported: number }>(
				`/v1/workplaces/${workplaceId}/integrations/square/import`,
				{
					method: "POST",
					body: {
						locationId: selectedLocationId,
						from,
						to,
						overwriteExisting: overwrite,
						reviewHash,
					},
				},
			),
		onSuccess: ({ imported }) => {
			setPreview(null);
			void queryClient.invalidateQueries({
				queryKey: ["report-summary", workplaceId],
			});
			toast.success(
				`${imported} daily sales figure${imported === 1 ? "" : "s"} imported`,
			);
		},
		onError: (error) => toast.error(error.message),
	});
	const disconnect = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/integrations/square`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			setPreview(null);
			void queryClient.invalidateQueries({ queryKey: ["square", workplaceId] });
			toast.success("Square disconnected");
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<SettingsSection
			title="Square sales"
			description="Import daily net sales by Location for labor reporting. Published schedules remain in jooling."
		>
			{status.isLoading ? (
				<p className="text-muted-foreground text-sm">
					Loading Square connection…
				</p>
			) : null}
			{status.isError ? (
				<p role="alert" className="text-destructive text-sm">
					{status.error.message}
				</p>
			) : null}
			{status.data?.connected === false ? (
				<Button disabled={connect.isPending} onClick={() => connect.mutate()}>
					Connect Square
				</Button>
			) : null}
			{status.data?.connected ? (
				<div className="grid gap-4">
					<p className="text-muted-foreground text-sm">
						Connected merchant: {status.data.merchantId}
					</p>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="square-jooling-location">
								Jooling Location
							</FieldLabel>
							<select
								id="square-jooling-location"
								className="h-9 rounded-md border bg-background px-3 text-sm"
								value={selectedLocationId}
								onChange={(event) => {
									setLocationId(event.target.value);
									setSquareLocationId("");
									setPreview(null);
								}}
							>
								{locations.data?.map((location) => (
									<option key={location.id} value={location.id}>
										{location.name}
									</option>
								))}
							</select>
						</Field>
						<Field>
							<FieldLabel htmlFor="square-source-location">
								Square Location
							</FieldLabel>
							<select
								id="square-source-location"
								className="h-9 rounded-md border bg-background px-3 text-sm"
								value={selectedSquareLocationId}
								onChange={(event) => {
									setSquareLocationId(event.target.value);
									setPreview(null);
								}}
							>
								<option value="">Select a Square Location</option>
								{status.data.squareLocations.map((location) => (
									<option key={location.id} value={location.id}>
										{location.name}
									</option>
								))}
							</select>
						</Field>
					</div>
					<Button
						variant="outline"
						disabled={
							!selectedLocationId ||
							!selectedSquareLocationId ||
							mapLocation.isPending ||
							mappedSquareLocationId === selectedSquareLocationId
						}
						onClick={() => mapLocation.mutate()}
					>
						Save Location mapping
					</Button>
					{mappedSquareLocationId &&
					mappedSquareLocationId === selectedSquareLocationId ? (
						<>
							<div className="flex flex-wrap gap-3">
								<Field>
									<FieldLabel htmlFor="square-from">From</FieldLabel>
									<Input
										id="square-from"
										type="date"
										value={from}
										onChange={(event) => {
											setFrom(event.target.value);
											setPreview(null);
										}}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="square-to">To</FieldLabel>
									<Input
										id="square-to"
										type="date"
										value={to}
										onChange={(event) => {
											setTo(event.target.value);
											setPreview(null);
										}}
									/>
								</Field>
							</div>
							<Button
								variant="outline"
								disabled={!validRange || previewImport.isPending}
								onClick={() => previewImport.mutate()}
							>
								Preview Square sales
							</Button>
						</>
					) : null}
					{preview ? (
						<div className="grid gap-3">
							<p className="text-sm">
								{preview.length} day{preview.length === 1 ? "" : "s"} returned.{" "}
								{preview.filter((row) => row.change).length} existing value
								{preview.filter((row) => row.change).length === 1 ? "" : "s"}{" "}
								would change.
							</p>
							<div className="max-h-56 overflow-auto rounded-md border">
								<table className="w-full text-left text-sm">
									<thead>
										<tr>
											<th className="p-2">Date</th>
											<th className="p-2">Square net sales</th>
											<th className="p-2">Current</th>
										</tr>
									</thead>
									<tbody>
										{preview.map((row) => (
											<tr key={row.date}>
												<td className="p-2">{row.date}</td>
												<td className="p-2">
													{(row.amountCents / 100).toFixed(2)}
												</td>
												<td className="p-2">
													{row.currentAmountCents === null
														? "—"
														: (row.currentAmountCents / 100).toFixed(2)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							{preview.some((row) => row.change) ? (
								<label
									htmlFor="square-overwrite"
									className="flex items-center gap-2 text-sm"
								>
									<Checkbox
										id="square-overwrite"
										checked={overwrite}
										onCheckedChange={(value) => setOverwrite(value === true)}
									/>{" "}
									Replace the differing sales values shown above
								</label>
							) : null}
							<Button
								disabled={
									preview.length === 0 ||
									importSales.isPending ||
									(preview.some((row) => row.change) && !overwrite)
								}
								onClick={() => importSales.mutate()}
							>
								Import reviewed sales
							</Button>
						</div>
					) : null}
					<Button
						variant="outline"
						disabled={disconnect.isPending}
						onClick={() => disconnect.mutate()}
					>
						Disconnect Square
					</Button>
				</div>
			) : null}
		</SettingsSection>
	);
}
