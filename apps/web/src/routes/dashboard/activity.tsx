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
import { createFileRoute } from "@tanstack/react-router";
import { BellIcon, ScrollTextIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import {
	AppPageBody,
	AppPageHeader,
	AppPane,
	AppSplit,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
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

const auditColumns = auditHelper.columns([
	auditHelper.accessor("summary", {
		header: "Event",
		cell: ({ getValue }) => (
			<span className="font-medium">{getValue()}</span>
		),
	}),
	auditHelper.accessor((row) => row.actorName ?? "", {
		id: "actor",
		header: "Actor",
		cell: ({ getValue }) => getValue() || "—",
	}),
	auditHelper.accessor("createdAt", {
		header: "When",
		cell: ({ getValue }) => (
			<span className="tabular-nums text-muted-foreground">
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

	const inboxColumns = useMemo(
		() =>
			inboxHelper.columns([
				inboxHelper.accessor("title", {
					header: "Notification",
					cell: ({ getValue, row }) => (
						<span className={row.original.readAt ? "" : "font-medium"}>
							{getValue()}
						</span>
					),
				}),
				inboxHelper.accessor("body", {
					header: "Detail",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
					),
				}),
				inboxHelper.accessor("createdAt", {
					header: "When",
					cell: ({ getValue }) => (
						<span className="tabular-nums text-muted-foreground">
							{new Date(getValue()).toLocaleString()}
						</span>
					),
				}),
				inboxHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						if (row.original.readAt) return null;
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									variant="outline"
									disabled={markRead.isPending}
									onClick={() =>
										markRead.mutate(row.original.id, {
											onError: (error) =>
												toast.error((error as Error).message),
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

	return (
		<AppSplit>
			<AppPane>
				<AppPageHeader
					title="Inbox"
					description="Coverage, schedule responses, and time-off requests."
					badge={
						unreadCount > 0 ? (
							<Badge variant="secondary">{unreadCount} unread</Badge>
						) : null
					}
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
								{markAll.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Mark all read
							</Button>
						) : null
					}
				/>
				<AppPageBody scroll={false}>
					{inbox.isLoading ? (
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="h-20" />
						</div>
					) : (
						<DataTable
							columns={inboxColumns}
							data={items}
							getRowId={(row) => row.id}
							empty={
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<BellIcon />
										</EmptyMedia>
										<EmptyTitle>No notifications</EmptyTitle>
										<EmptyDescription>
											Worker requests and responses will appear here.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							}
						/>
					)}
				</AppPageBody>
			</AppPane>

			<AppPane className="border-t lg:max-w-md lg:border-t-0 lg:border-l">
				<AppPageHeader
					title="Audit trail"
					description="Publication, time-off decisions, and coverage assignments."
				/>
				<AppPageBody scroll={false}>
					{audit.isLoading ? (
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="h-20" />
						</div>
					) : (
						<DataTable
							columns={auditColumns}
							data={events}
							getRowId={(row) => row.id}
							empty={
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<ScrollTextIcon />
										</EmptyMedia>
										<EmptyTitle>No manager actions yet</EmptyTitle>
										<EmptyDescription>
											Publishing a week or deciding a request writes an audit
											event.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							}
						/>
					)}
				</AppPageBody>
			</AppPane>
		</AppSplit>
	);
}
