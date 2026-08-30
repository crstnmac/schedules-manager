import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
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
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { toast } from "sonner";

import {
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/inbox")({
	component: WorkerInbox,
});

function WorkerInbox() {
	const { workplace } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const markRead = useMarkNotificationRead(workplace?.id);
	const markAll = useMarkAllNotificationsRead(workplace?.id);
	const items = inbox.data?.notifications ?? [];
	const unreadCount = inbox.data?.unreadCount ?? 0;

	return (
		<section className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Inbox</CardTitle>
					<CardDescription>
						Published schedules, late changes, coverage, and time-off decisions
						land here even if a push or email is delayed.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{unreadCount > 0 ? (
						<Button
							size="sm"
							variant="outline"
							className="self-start"
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
					) : null}

					{inbox.isLoading ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
						</div>
					) : null}

					{!inbox.isLoading && items.length === 0 ? (
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
					) : null}

					{items.length > 0 ? (
						<ItemGroup>
							{items.map((item) => (
								<Item key={item.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>{item.title}</ItemTitle>
										<ItemDescription>
											{item.body} · {new Date(item.createdAt).toLocaleString()}
										</ItemDescription>
									</ItemContent>
									{item.readAt ? null : (
										<ItemActions>
											<Button
												size="sm"
												variant="outline"
												disabled={markRead.isPending}
												onClick={() =>
													markRead.mutate(item.id, {
														onError: (error) =>
															toast.error((error as Error).message),
													})
												}
											>
												Mark read
											</Button>
										</ItemActions>
									)}
								</Item>
							))}
						</ItemGroup>
					) : null}
				</CardContent>
			</Card>
		</section>
	);
}
