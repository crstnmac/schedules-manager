import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, KeyRoundIcon, WebhookIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { createDataColumnHelper } from "@/components/data-table";
import {
	SettingsCrudCard,
	SettingsFormSheet,
} from "@/components/settings/crud";
import { api } from "@/lib/api";

const API_KEY_SCOPES = [
	"schedule.read",
	"schedule.write",
	"workers.read",
	"reports.read",
	"requests.read",
	"requests.write",
] as const;
type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

interface ApiKeyDto {
	id: string;
	name: string;
	keyPrefix: string;
	scopes: ApiKeyScope[];
	lastUsedAt: string | null;
	expiresAt: string | null;
	revokedAt: string | null;
	createdAt: string;
}

interface WebhookEndpointDto {
	id: string;
	name: string;
	url: string;
	eventTypes: string[];
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

interface WebhookDeliveryDto {
	id: string;
	endpointId: string;
	endpointName: string;
	eventType: string;
	status: "pending" | "delivered" | "failed";
	attempts: number;
	responseStatus: number | null;
	lastError: string | null;
	nextAttemptAt: string | null;
	deliveredAt: string | null;
	createdAt: string;
}

const apiKeyHelper = createDataColumnHelper<ApiKeyDto>();
const endpointHelper = createDataColumnHelper<WebhookEndpointDto>();
const deliveryHelper = createDataColumnHelper<WebhookDeliveryDto>();

const sheetFooterClassName =
	"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

function formatTimestamp(value: string | null | undefined): string {
	if (!value) return "—";
	return new Date(value).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function useApiKeys(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["api-keys", workplaceId],
		queryFn: () =>
			api<{ apiKeys: ApiKeyDto[] }>(`/v1/workplaces/${workplaceId}/api-keys`),
		enabled: Boolean(workplaceId),
	});
}

function useWebhookEndpoints(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["webhook-endpoints", workplaceId],
		queryFn: () =>
			api<{ endpoints: WebhookEndpointDto[] }>(
				`/v1/workplaces/${workplaceId}/webhook-endpoints`,
			),
		enabled: Boolean(workplaceId),
	});
}

function useWebhookDeliveries(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["webhook-deliveries", workplaceId],
		queryFn: () =>
			api<{ deliveries: WebhookDeliveryDto[] }>(
				`/v1/workplaces/${workplaceId}/webhook-deliveries?limit=100`,
			),
		enabled: Boolean(workplaceId),
	});
}

function SecretDialog({
	open,
	onOpenChange,
	title,
	description,
	value,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	value: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<InputGroup>
					<InputGroupInput readOnly value={value} className="font-mono" />
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							aria-label="Copy secret"
							onClick={() => {
								navigator.clipboard
									.writeText(value)
									.then(() => toast.success("Copied."))
									.catch(() => toast.error("Copy failed."));
							}}
						>
							<CopyIcon />
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
				<DialogFooter showCloseButton />
			</DialogContent>
		</Dialog>
	);
}

export function ApiKeysCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const queryClient = useQueryClient();
	const keys = useApiKeys(workplaceId);
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<ApiKeyScope[]>(["schedule.read"]);
	const [expiresAt, setExpiresAt] = useState("");
	const [revealedToken, setRevealedToken] = useState<string | null>(null);

	const resetForm = useCallback(() => {
		setName("");
		setScopes(["schedule.read"]);
		setExpiresAt("");
	}, []);

	const save = useMutation({
		mutationFn: () =>
			api<{ token: string }>(`/v1/workplaces/${workplaceId}/api-keys`, {
				method: "POST",
				body: {
					name: name.trim(),
					scopes,
					expiresAt: expiresAt ? `${expiresAt}T23:59:59.999Z` : undefined,
				},
			}),
		onSuccess: (data) => {
			setRevealedToken(data.token);
			resetForm();
			setOpen(false);
			queryClient.invalidateQueries({ queryKey: ["api-keys", workplaceId] });
			toast.success("API key created.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const revoke = useMutation({
		mutationFn: (keyId: string) =>
			api(`/v1/workplaces/${workplaceId}/api-keys/${keyId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["api-keys", workplaceId] });
			toast.success("API key revoked.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const columns = useMemo(
		() =>
			apiKeyHelper.columns([
				apiKeyHelper.accessor("name", {
					header: "Name",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				apiKeyHelper.accessor("keyPrefix", {
					header: "Key",
					cell: ({ getValue }) => (
						<code className="text-muted-foreground text-xs">{getValue()}…</code>
					),
				}),
				apiKeyHelper.accessor((row) => row.scopes.join(", "), {
					id: "scopes",
					header: "Scopes",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground text-xs">{getValue()}</span>
					),
				}),
				apiKeyHelper.accessor("lastUsedAt", {
					header: "Last used",
					cell: ({ getValue }) => formatTimestamp(getValue()),
				}),
				apiKeyHelper.display({
					id: "status",
					header: "Status",
					cell: ({ row }) => {
						if (row.original.revokedAt) {
							return <Badge variant="destructive">Revoked</Badge>;
						}
						if (
							row.original.expiresAt &&
							new Date(row.original.expiresAt).getTime() <= Date.now()
						) {
							return <Badge variant="outline">Expired</Badge>;
						}
						return <Badge variant="secondary">Active</Badge>;
					},
				}),
			]),
		[],
	);

	return (
		<>
			<SettingsCrudCard
				title="API keys"
				description="Scoped keys for the public API. The full token is shown once."
				count={keys.data?.apiKeys.length ?? 0}
				data={keys.data?.apiKeys ?? []}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => `${row.name} ${row.keyPrefix}`}
				searchPlaceholder="Search API keys"
				isLoading={keys.isLoading}
				entityLabel="API key"
				emptyIcon={<KeyRoundIcon />}
				emptyTitle="No API keys yet"
				emptyDescription="Create a scoped key to let an integration read or write on your behalf."
				addLabel="Create key"
				onAdd={() => {
					resetForm();
					setOpen(true);
				}}
				rowActions={{
					onDelete: (row) => revoke.mutate(row.id),
					deleteTitle: "Revoke this API key?",
					deleteDescription:
						"Requests using this key stop working immediately. This cannot be undone.",
					deleteDisabled: revoke.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title="Create API key"
				description="Choose the scopes this key may use. The token is shown once."
				footer={
					<div className={sheetFooterClassName}>
						<Button
							variant="outline"
							onClick={() => {
								setOpen(false);
								resetForm();
							}}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							form="api-key-form"
							disabled={!name.trim() || scopes.length === 0 || save.isPending}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							Create key
						</Button>
					</div>
				}
			>
				<form
					id="api-key-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="api-key-name">Name</FieldLabel>
							<Input
								id="api-key-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Payroll sync"
								autoFocus
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="api-key-expires">
								Expires (optional)
							</FieldLabel>
							<Input
								id="api-key-expires"
								type="date"
								value={expiresAt}
								onChange={(event) => setExpiresAt(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldTitle>Scopes</FieldTitle>
							<div className="flex flex-col gap-2">
								{API_KEY_SCOPES.map((scope) => (
									<Field
										key={scope}
										orientation="horizontal"
										className="items-center"
									>
										<Checkbox
											id={`api-key-scope-${scope}`}
											checked={scopes.includes(scope)}
											onCheckedChange={() =>
												setScopes((current) =>
													current.includes(scope)
														? current.filter((item) => item !== scope)
														: [...current, scope],
												)
											}
										/>
										<FieldLabel
											htmlFor={`api-key-scope-${scope}`}
											className="font-mono font-normal text-xs"
										>
											{scope}
										</FieldLabel>
									</Field>
								))}
							</div>
						</Field>
					</FieldGroup>
				</form>
			</SettingsFormSheet>

			<SecretDialog
				open={revealedToken !== null}
				onOpenChange={(next) => {
					if (!next) setRevealedToken(null);
				}}
				title="Your API key"
				description="Copy it now. For your security it will not be shown again."
				value={revealedToken ?? ""}
			/>
		</>
	);
}

function parseEventTypes(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function WebhookEndpointsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const queryClient = useQueryClient();
	const endpoints = useWebhookEndpoints(workplaceId);
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [eventTypes, setEventTypes] = useState("");
	const [active, setActive] = useState(true);
	const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

	const resetForm = useCallback(() => {
		setEditingId(null);
		setName("");
		setUrl("");
		setEventTypes("");
		setActive(true);
	}, []);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: ["webhook-endpoints", workplaceId],
		});

	const save = useMutation({
		mutationFn: () =>
			api<{ endpoint: WebhookEndpointDto & { secret?: string } }>(
				editingId
					? `/v1/workplaces/${workplaceId}/webhook-endpoints/${editingId}`
					: `/v1/workplaces/${workplaceId}/webhook-endpoints`,
				{
					method: editingId ? "PATCH" : "POST",
					body: {
						name: name.trim(),
						url: url.trim(),
						eventTypes: parseEventTypes(eventTypes),
						active,
					},
				},
			),
		onSuccess: (data) => {
			if (!editingId && data.endpoint.secret) {
				setRevealedSecret(data.endpoint.secret);
			}
			resetForm();
			setOpen(false);
			invalidate();
			toast.success("Webhook endpoint saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const toggle = useMutation({
		mutationFn: (input: { id: string; active: boolean }) =>
			api(`/v1/workplaces/${workplaceId}/webhook-endpoints/${input.id}`, {
				method: "PATCH",
				body: { active: input.active },
			}),
		onSuccess: () => invalidate(),
		onError: (error) => toast.error((error as Error).message),
	});
	const remove = useMutation({
		mutationFn: (endpointId: string) =>
			api(`/v1/workplaces/${workplaceId}/webhook-endpoints/${endpointId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Webhook endpoint deleted.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const startAdd = () => {
		resetForm();
		setOpen(true);
	};
	const startEdit = (endpoint: WebhookEndpointDto) => {
		setEditingId(endpoint.id);
		setName(endpoint.name);
		setUrl(endpoint.url);
		setEventTypes(endpoint.eventTypes.join(", "));
		setActive(endpoint.active);
		setOpen(true);
	};

	const columns = useMemo(
		() =>
			endpointHelper.columns([
				endpointHelper.accessor("name", {
					header: "Name",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				endpointHelper.accessor("url", {
					header: "URL",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground text-xs">{getValue()}</span>
					),
				}),
				endpointHelper.accessor((row) => row.eventTypes.join(", "), {
					id: "events",
					header: "Events",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground text-xs">
							{getValue() || "All events"}
						</span>
					),
				}),
				endpointHelper.display({
					id: "active",
					header: "Active",
					cell: ({ row }) => (
						<Field orientation="horizontal" className="items-center">
							<Checkbox
								aria-label="Endpoint active"
								checked={row.original.active}
								disabled={toggle.isPending}
								onCheckedChange={(checked) =>
									toggle.mutate({
										id: row.original.id,
										active: checked === true,
									})
								}
							/>
						</Field>
					),
				}),
			]),
		[toggle],
	);

	return (
		<>
			<SettingsCrudCard
				title="Webhook endpoints"
				description="We POST signed JSON for every matching audited event, with retries."
				count={endpoints.data?.endpoints.length ?? 0}
				data={endpoints.data?.endpoints ?? []}
				columns={columns}
				getRowId={(row) => row.id}
				getSearchText={(row) => `${row.name} ${row.url}`}
				searchPlaceholder="Search endpoints"
				isLoading={endpoints.isLoading}
				entityLabel="endpoint"
				emptyIcon={<WebhookIcon />}
				emptyTitle="No webhook endpoints yet"
				emptyDescription="Add a URL to receive signed events when scheduling changes."
				addLabel="Add endpoint"
				onAdd={startAdd}
				rowActions={{
					onEdit: startEdit,
					onDelete: (row) => remove.mutate(row.id),
					deleteTitle: "Delete this webhook endpoint?",
					deleteDescription:
						"Pending deliveries for this endpoint are removed. This cannot be undone.",
					deleteDisabled: remove.isPending,
				}}
			/>

			<SettingsFormSheet
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) resetForm();
				}}
				title={editingId ? "Edit webhook endpoint" : "Add webhook endpoint"}
				description={
					editingId
						? "Update the destination, subscribed events, or active state."
						: "Leave events empty to receive every event. The signing secret is shown once."
				}
				footer={
					<div className={sheetFooterClassName}>
						<Button
							variant="outline"
							onClick={() => {
								setOpen(false);
								resetForm();
							}}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							form="endpoint-form"
							disabled={!name.trim() || !url.trim() || save.isPending}
						>
							{save.isPending ? <Spinner data-icon="inline-start" /> : null}
							{editingId ? "Save endpoint" : "Add endpoint"}
						</Button>
					</div>
				}
			>
				<form
					id="endpoint-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="endpoint-name">Name</FieldLabel>
							<Input
								id="endpoint-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Payroll provider"
								autoFocus
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="endpoint-url">URL</FieldLabel>
							<Input
								id="endpoint-url"
								type="url"
								value={url}
								onChange={(event) => setUrl(event.target.value)}
								placeholder="https://example.com/webhooks/jooling"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="endpoint-events">
								Events (optional)
							</FieldLabel>
							<Input
								id="endpoint-events"
								value={eventTypes}
								onChange={(event) => setEventTypes(event.target.value)}
								placeholder="schedule.published, schedule.changed"
							/>
							<p className="text-muted-foreground text-xs">
								Comma separated. Empty receives all events.
							</p>
						</Field>
						<Field orientation="horizontal" className="items-center">
							<Checkbox
								id="endpoint-active"
								checked={active}
								onCheckedChange={(checked) => setActive(checked === true)}
							/>
							<FieldLabel htmlFor="endpoint-active" className="font-normal">
								Active
							</FieldLabel>
						</Field>
					</FieldGroup>
				</form>
			</SettingsFormSheet>

			<SecretDialog
				open={revealedSecret !== null}
				onOpenChange={(next) => {
					if (!next) setRevealedSecret(null);
				}}
				title="Webhook signing secret"
				description="Use this to verify X-Jooling-Signature. It will not be shown again."
				value={revealedSecret ?? ""}
			/>
		</>
	);
}

function deliveryStatusBadge(status: WebhookDeliveryDto["status"]): ReactNode {
	if (status === "delivered")
		return <Badge variant="secondary">Delivered</Badge>;
	if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
	return <Badge variant="outline">Pending</Badge>;
}

export function WebhookDeliveriesCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const deliveries = useWebhookDeliveries(workplaceId);

	const columns = useMemo(
		() =>
			deliveryHelper.columns([
				deliveryHelper.accessor("createdAt", {
					header: "Created",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground text-xs">
							{formatTimestamp(getValue())}
						</span>
					),
				}),
				deliveryHelper.accessor("endpointName", {
					header: "Endpoint",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				deliveryHelper.accessor("eventType", {
					header: "Event",
					cell: ({ getValue }) => <code className="text-xs">{getValue()}</code>,
				}),
				deliveryHelper.display({
					id: "status",
					header: "Status",
					cell: ({ row }) => deliveryStatusBadge(row.original.status),
				}),
				deliveryHelper.accessor("attempts", {
					header: "Attempts",
					cell: ({ getValue }) => (
						<span className="tabular-nums">{getValue()}</span>
					),
				}),
				deliveryHelper.accessor("responseStatus", {
					header: "Response",
					cell: ({ getValue }) => (
						<span className="tabular-nums">{getValue() ?? "—"}</span>
					),
				}),
				deliveryHelper.accessor("lastError", {
					header: "Last error",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground text-xs">
							{getValue() ?? "—"}
						</span>
					),
				}),
			]),
		[],
	);

	return (
		<SettingsCrudCard
			title="Recent deliveries"
			description="The latest 100 webhook attempts across all endpoints."
			count={deliveries.data?.deliveries.length ?? 0}
			data={deliveries.data?.deliveries ?? []}
			columns={columns}
			getRowId={(row) => row.id}
			isLoading={deliveries.isLoading}
			entityLabel="delivery"
			emptyIcon={<WebhookIcon />}
			emptyTitle="No deliveries yet"
			emptyDescription="Deliveries appear here once an audited event matches an active endpoint."
			addLabel="Add delivery"
		/>
	);
}
