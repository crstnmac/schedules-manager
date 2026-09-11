import { env } from "@SchedulesManager/env/web";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { BellIcon, DownloadIcon, ScrollTextIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
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
	useAuditEvents,
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

const AUDIT_ACTIONS = [
	{ label: "All actions", value: "all" },
	{ label: "Schedule published", value: "schedule.published" },
	{ label: "Schedule reminder", value: "schedule.reminder" },
	{ label: "Time off recorded", value: "time_off.recorded" },
	{ label: "Shift release approved", value: "coverage.release_approved" },
	{ label: "Shift pickup approved", value: "coverage.pickup_approved" },
	{ label: "Shift swap approved", value: "swap.approved" },
	{ label: "Attendance marked", value: "attendance.marked" },
	{ label: "Time entry edited", value: "time_entry.edited" },
	{ label: "Announcement posted", value: "announcement.posted" },
];

const AUDIT_PAGE_SIZE = 25;

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
	const markRead = useMarkNotificationRead(workplace?.id);
	const markAll = useMarkAllNotificationsRead(workplace?.id);
	const items = inbox.data?.notifications ?? [];
	const unreadCount = inbox.data?.unreadCount ?? 0;

	const [tab, setTab] = useState<"inbox" | "audit">("inbox");
	const [inboxSearch, setInboxSearch] = useState("");
	const [readFilter, setReadFilter] = useState("all");
	const [auditFrom, setAuditFrom] = useState("");
	const [auditTo, setAuditTo] = useState("");
	const [auditAction, setAuditAction] = useState("all");
	const [auditPage, setAuditPage] = useState(1);
	const [auditPageSize, setAuditPageSize] = useState(AUDIT_PAGE_SIZE);
	const [isDownloadingAudit, setIsDownloadingAudit] = useState(false);

	const audit = useAuditEvents(workplace?.id, {
		from: auditFrom || undefined,
		to: auditTo || undefined,
		action: auditAction === "all" ? undefined : auditAction,
		limit: auditPageSize,
		offset: (auditPage - 1) * auditPageSize,
	});
	const events = audit.data?.events ?? [];
	const auditTotal = audit.data?.total ?? events.length;
	const auditPageCount = Math.max(1, Math.ceil(auditTotal / auditPageSize));

	function updateAuditFilters(apply: () => void) {
		apply();
		setAuditPage(1);
	}

	async function downloadAudit() {
		if (!workplace || isDownloadingAudit) return;
		setIsDownloadingAudit(true);
		try {
			const params = new URLSearchParams({ format: "csv", limit: "200" });
			if (auditFrom) params.set("from", auditFrom);
			if (auditTo) params.set("to", auditTo);
			if (auditAction !== "all") params.set("action", auditAction);
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/workplaces/${workplace.id}/audit?${params.toString()}`,
				{ credentials: "include" },
			);
			if (!response.ok) throw new Error("Couldn’t download the audit trail.");
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "audit.csv";
			link.click();
			URL.revokeObjectURL(url);
			toast.success("Audit trail downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Couldn’t download the audit trail.",
			);
		} finally {
			setIsDownloadingAudit(false);
		}
	}

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

	const auditRows = events;

	const inboxPagination = useTablePagination(inboxRows, {
		resetKey: `${inboxSearch}|${readFilter}`,
	});
	const auditPagination = {
		page: Math.min(auditPage, auditPageCount),
		pageCount: auditPageCount,
		pageSize: auditPageSize,
		total: auditTotal,
		rangeStart: auditTotal === 0 ? 0 : (auditPage - 1) * auditPageSize + 1,
		rangeEnd: Math.min(
			(auditPage - 1) * auditPageSize + events.length,
			auditTotal,
		),
		setPage: setAuditPage,
		setPageSize: (size: number) => {
			setAuditPageSize(size);
			setAuditPage(1);
		},
	};

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
								<Badge variant="secondary">{auditTotal}</Badge>
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
								<>
									<Field className="w-36">
										<FieldLabel htmlFor="audit-from">From</FieldLabel>
										<DatePicker
											id="audit-from"
											value={auditFrom}
											onValueChange={(value) =>
												updateAuditFilters(() => setAuditFrom(value))
											}
											displayValue={auditFrom || "Any"}
										/>
									</Field>
									<Field className="w-36">
										<FieldLabel htmlFor="audit-to">To</FieldLabel>
										<DatePicker
											id="audit-to"
											value={auditTo}
											onValueChange={(value) =>
												updateAuditFilters(() => setAuditTo(value))
											}
											displayValue={auditTo || "Any"}
										/>
									</Field>
									<TableFilter
										value={auditAction}
										onValueChange={(value) =>
											updateAuditFilters(() => setAuditAction(value))
										}
										items={AUDIT_ACTIONS}
										ariaLabel="Filter by action"
									/>
									<Button
										size="sm"
										variant="outline"
										disabled={isDownloadingAudit || !workplace}
										onClick={() => void downloadAudit()}
									>
										<DownloadIcon data-icon="inline-start" />
										{isDownloadingAudit ? "Downloading…" : "Download CSV"}
									</Button>
								</>
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
									data={auditRows}
									getRowId={(row) => row.id}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyMedia variant="icon">
														<ScrollTextIcon />
													</EmptyMedia>
													<EmptyTitle>
														{auditTotal === 0
															? "No manager actions yet"
															: "No matches"}
													</EmptyTitle>
													<EmptyDescription>
														{auditTotal === 0
															? "Publishing a week or deciding a request writes an audit event."
															: "Try a different date range or action."}
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
