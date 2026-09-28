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
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { ListToolbar, useListView } from "@/components/list-view";
import {
	INBOX_FILTERS,
	INBOX_SORTS,
	isUnread,
	notificationId,
	searchNotification,
} from "@/lib/inbox-list";
import {
	type InboxNotification,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries";
import { formatClockTime, formatDay } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/inbox")({
	component: WorkerInbox,
});

const columnHelper = createDataColumnHelper<InboxNotification>();

function WorkerInbox() {
	const { workplace } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const markRead = useMarkNotificationRead(workplace?.id);
	const markAll = useMarkAllNotificationsRead(workplace?.id);
	const items = inbox.data?.notifications ?? [];
	const unreadCount = inbox.data?.unreadCount ?? 0;

	const columns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor("title", {
					header: "Notification",
					cell: ({ row }) => (
						<div className="flex flex-col gap-0.5">
							<Link
								className="w-fit font-medium underline underline-offset-4"
								to={
									row.original.kind === "open_shift"
										? "/worker/openshifts"
										: row.original.kind.startsWith("time_off") ||
												row.original.kind.startsWith("unavailability")
											? "/worker/availability"
											: row.original.kind.includes("announcement")
												? "/worker/announcements"
												: row.original.kind.includes("message")
													? "/worker/messages"
													: "/worker"
								}
								onClick={() => {
									if (!row.original.readAt) {
										markRead.mutate(row.original.id, {
											onError: (error) => toast.error((error as Error).message),
										});
									}
								}}
							>
								{row.original.title}
							</Link>
							<span className="text-muted-foreground">{row.original.body}</span>
						</div>
					),
				}),
				columnHelper.accessor("createdAt", {
					header: "When",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground tabular-nums">
							{formatDay(getValue())} · {formatClockTime(getValue())}
						</span>
					),
				}),
				columnHelper.display({
					id: "actions",
					header: () => <span className="block text-right">Actions</span>,
					enableSorting: false,
					cell: ({ row }) => {
						if (row.original.readAt) {
							return (
								<div className="flex justify-end">
									<span className="text-muted-foreground text-xs">Read</span>
								</div>
							);
						}
						const pendingThis =
							markRead.isPending && markRead.variables === row.original.id;
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									variant="outline"
									disabled={pendingThis}
									onClick={() =>
										markRead.mutate(row.original.id, {
											onError: (error) => toast.error((error as Error).message),
										})
									}
								>
									{pendingThis ? <Spinner data-icon="inline-start" /> : null}
									Mark read
								</Button>
							</div>
						);
					},
				}),
			]),
		[markRead],
	);

	const list = useListView<InboxNotification>({
		rows: items,
		getRowId: notificationId,
		search: searchNotification,
		filters: INBOX_FILTERS,
		sorts: INBOX_SORTS,
		defaultSort: { id: "createdAt", direction: "desc" },
		selectable: isUnread,
	});
	const markSelectedRead = useMutation({
		mutationFn: async (ids: string[]) => {
			for (const id of ids) await markRead.mutateAsync(id);
			return ids.length;
		},
		onSuccess: (count) => {
			list.selection?.clear();
			toast.success(
				`Marked ${count} ${count === 1 ? "notification" : "notifications"} read.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<AppPage>
			<AppPageHeader
				title="Inbox"
				description="Published schedules, late changes, coverage, and time-off decisions."
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
							Mark all as read
						</Button>
					) : null
				}
			/>
			<AppPageBody scroll={false}>
				<ListToolbar
					list={list}
					searchPlaceholder="Search notifications"
					noun={{ one: "notification", many: "notifications" }}
					bulkActions={(selected) => (
						<Button
							size="sm"
							disabled={markSelectedRead.isPending}
							onClick={() =>
								markSelectedRead.mutate(selected.map((item) => item.id))
							}
						>
							{markSelectedRead.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Mark read
						</Button>
					)}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					{inbox.isLoading ? (
						<div className="flex flex-col gap-2 p-4" role="status">
							<span className="sr-only">Loading</span>
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
						</div>
					) : (
						<DataTable
							fill={false}
							stacked
							query={inbox}
							columns={columns}
							list={list}
							data={list.pagination.pageRows}
							getRowId={notificationId}
							empty={
								<div className="p-4">
									<Empty className="border border-dashed">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<BellIcon />
											</EmptyMedia>
											<EmptyTitle>
												{items.length === 0
													? "No notifications yet"
													: "No matches"}
											</EmptyTitle>
											<EmptyDescription>
												{items.length === 0
													? "When your manager publishes a week or decides a request, it will show up here."
													: "Try a different search or filter."}
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								</div>
							}
						/>
					)}
				</div>
			</AppPageBody>
		</AppPage>
	);
}
