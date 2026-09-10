import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { BellIcon, ScrollTextIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import {
	type AuditEventDto,
	type InboxNotification,
	useAudit,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/activity")({
	component: ActivityPage,
});

const inboxHelper = createDataColumnHelper<InboxNotification>();
const auditHelper = createDataColumnHelper<AuditEventDto>();

const READ_FILTERS = [
	{ label: "All notifications", value: "all" },
	{ label: "Unread", value: "unread" },
	{ label: "Read", value: "read" },
];

const auditColumns = auditHelper.columns([
	auditHelper.accessor("summary", {
		header: "Event",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	auditHelper.accessor((row) => row.actorName ?? "", {
		id: "actor",
		header: "Actor",
		cell: ({ getValue }) => getValue() || "—",
	}),
	auditHelper.accessor("createdAt", {
		header: "When",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground tabular-nums">
				{new Date(getValue()).toLocaleString()}
			</span>
		),
	}),
]);

function ActivityPage() {
	const { workplace } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const audit = useAudit(workplace?.id);
	const markRead = useMarkNotificationRead(workplace?.id);
	const markAll = useMarkAllNotificationsRead(workplace?.id);
	const items = inbox.data?.notifications ?? [];
	const unreadCount = inbox.data?.unreadCount ?? 0;
	const events = audit.data ?? [];

	const [tab, setTab] = useState<"inbox" | "audit">("inbox");
	const [inboxSearch, setInboxSearch] = useState("");
	const [readFilter, setReadFilter] = useState("all");
	const [auditSearch, setAuditSearch] = useState("");

	const inboxColumns = useMemo(
		() =>
			inboxHelper.columns([
				inboxHelper.accessor("title", {
					header: "Notification",
					cell: ({ row }) => (
						<div className="flex flex-col gap-0.5">
							<span
								className={row.original.readAt ? "font-normal" : "font-medium"}
							>
								{row.original.title}
							</span>
							<span className="text-muted-foreground">{row.original.body}</span>
						</div>
					),
				}),
				inboxHelper.accessor("createdAt", {
					header: "When",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground tabular-nums">
							{new Date(getValue()).toLocaleString()}
						</span>
					),
				}),
				inboxHelper.display({
					id: "actions",
					header: () => <span className="block text-right">Actions</span>,
					enableSorting: false,
					cell: ({ row }) => {
						if (row.original.readAt) {
							return (
								<div className="flex justify-end">
									<Badge variant="outline">Read</Badge>
								</div>
							);
						}
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									variant="outline"
									disabled={markRead.isPending}
									onClick={() =>
										markRead.mutate(row.original.id, {
											onError: (error) => toast.error((error as Error).message),
										})
									}
								>
									Mark read
								</Button>
							</div>
						);
					},
				}),
			]),
		[markRead],
	);

	const inboxRows = useMemo(() => {
		const term = inboxSearch.trim().toLowerCase();
		return items.filter((item) => {
			if (readFilter === "unread" && item.readAt) return false;
			if (readFilter === "read" && !item.readAt) return false;
			if (!term) return true;
			return `${item.title} ${item.body}`.toLowerCase().includes(term);
		});
	}, [items, inboxSearch, readFilter]);

	const auditRows = useMemo(() => {
		const term = auditSearch.trim().toLowerCase();
		if (!term) return events;
		return events.filter((event) =>
			`${event.summary} ${event.actorName ?? ""}`.toLowerCase().includes(term),
		);
	}, [events, auditSearch]);

	const inboxPagination = useTablePagination(inboxRows, {
		resetKey: `${inboxSearch}|${readFilter}`,
	});
	const auditPagination = useTablePagination(auditRows, {
		resetKey: auditSearch,
	});

	return (
		<AppPage>
			<AppPageHeader
				title="Activity"
				badge={
					unreadCount > 0 ? (
						<Badge variant="secondary">{unreadCount} unread</Badge>
					) : null
				}
				description="Coverage, schedule responses, time-off requests, and manager actions."
				actions={
					unreadCount > 0 ? (
						<Button
							size="sm"
							variant="outline"
							disabled={markAll.isPending}
							onClick={() =>
								markAll.mutate(undefined, {
									onError: (error) => toast.error((error as Error).message),
								})
							}
						>
							{markAll.isPending ? <Spinner data-icon="inline-start" /> : null}
							Mark all read
						</Button>
					) : null
				}
			/>
			<AppPageBody scroll={false}>
				<Tabs
					value={tab}
					onValueChange={(value) => setTab(value as "inbox" | "audit")}
					className="min-h-0 flex-1 gap-0"
				>
					<div className="shrink-0 border-b px-4 py-2">
						<TabsList variant="line">
							<TabsTrigger value="inbox">
								Inbox
								{unreadCount > 0 ? (
									<Badge variant="secondary">{unreadCount}</Badge>
								) : null}
							</TabsTrigger>
							<TabsTrigger value="audit">
								Audit trail
								<Badge variant="secondary">{events.length}</Badge>
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="inbox" className="flex min-h-0 flex-1 flex-col">
						<TableToolbar
							left={
								<>
									<TableSearch
										value={inboxSearch}
										onValueChange={setInboxSearch}
										placeholder="Search notifications"
									/>
									<TableFilter
										value={readFilter}
										onValueChange={setReadFilter}
										items={READ_FILTERS}
										ariaLabel="Filter by read state"
									/>
								</>
							}
							right={<TablePagination {...inboxPagination} />}
						/>
						<div className="min-h-0 flex-1 overflow-auto">
							{inbox.isLoading ? (
								<div className="flex flex-col gap-3 p-4">
									<Skeleton className="h-20" />
								</div>
							) : (
								<DataTable
									fill={false}
									stacked
									query={inbox}
									columns={inboxColumns}
									data={inboxPagination.pageRows}
									getRowId={(row) => row.id}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyMedia variant="icon">
														<BellIcon />
													</EmptyMedia>
													<EmptyTitle>
														{items.length === 0
															? "No notifications"
															: "No matches"}
													</EmptyTitle>
													<EmptyDescription>
														{items.length === 0
															? "Worker requests and responses will appear here."
															: "Try a different search or filter."}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										</div>
									}
								/>
							)}
						</div>
					</TabsContent>

					<TabsContent value="audit" className="flex min-h-0 flex-1 flex-col">
						<TableToolbar
							left={
								<TableSearch
									value={auditSearch}
									onValueChange={setAuditSearch}
									placeholder="Search audit events"
								/>
							}
							right={<TablePagination {...auditPagination} />}
						/>
						<div className="min-h-0 flex-1 overflow-auto">
							{audit.isLoading ? (
								<div className="flex flex-col gap-3 p-4">
									<Skeleton className="h-20" />
								</div>
							) : (
								<DataTable
									fill={false}
									stacked
									query={audit}
									columns={auditColumns}
									data={auditPagination.pageRows}
									getRowId={(row) => row.id}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyMedia variant="icon">
														<ScrollTextIcon />
													</EmptyMedia>
													<EmptyTitle>
														{events.length === 0
															? "No manager actions yet"
															: "No matches"}
													</EmptyTitle>
													<EmptyDescription>
														{events.length === 0
															? "Publishing a week or deciding a request writes an audit event."
															: "Try a different search."}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										</div>
									}
								/>
							)}
						</div>
					</TabsContent>
				</Tabs>
			</AppPageBody>
		</AppPage>
	);
}
