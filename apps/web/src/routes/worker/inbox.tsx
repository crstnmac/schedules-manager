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
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
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
					cell: ({ getValue, row }) => (
						<Link
							className="font-medium underline underline-offset-4"
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
							{getValue()}
						</Link>
					),
				}),
				columnHelper.accessor("body", {
					header: "Detail",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue()}</span>
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
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						if (row.original.readAt) return null;
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
				{inbox.isLoading ? (
					<div className="flex flex-col gap-2 p-4">
						<Skeleton className="h-16" />
						<Skeleton className="h-16" />
					</div>
				) : (
					<DataTable
						stacked
						query={inbox}
						columns={columns}
						data={items}
						getRowId={(row) => row.id}
						empty={
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<BellIcon />
									</EmptyMedia>
									<EmptyTitle>No notifications yet</EmptyTitle>
									<EmptyDescription>
										When your manager publishes a week or decides a request, it
										will show up here.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						}
					/>
				)}
			</AppPageBody>
		</AppPage>
	);
}
