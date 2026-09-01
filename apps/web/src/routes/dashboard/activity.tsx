import { Badge } from "@SchedulesManager/ui/components/badge";
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
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { BellIcon, ScrollTextIcon } from "lucide-react";
import { toast } from "sonner";

import { ProgressiveItemGroup } from "@/components/progressive-item-group";
import {
	useAudit,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/activity")({
	component: ActivityPage,
});

function ActivityPage() {
	const { workplace } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const audit = useAudit(workplace?.id);
	const markRead = useMarkNotificationRead(workplace?.id);
	const markAll = useMarkAllNotificationsRead(workplace?.id);
	const items = inbox.data?.notifications ?? [];
	const unreadCount = inbox.data?.unreadCount ?? 0;
	const events = audit.data ?? [];

	return (
		<section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<div className="flex items-center gap-2">
								<CardTitle>Inbox</CardTitle>
								{unreadCount > 0 ? (
									<Badge variant="secondary">{unreadCount} unread</Badge>
								) : null}
							</div>
							<CardDescription>
								Coverage, schedule responses, and time-off requests.
							</CardDescription>
						</div>
						{unreadCount > 0 ? (
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
						) : null}
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{inbox.isLoading ? <Skeleton className="h-20" /> : null}

					{!inbox.isLoading && items.length === 0 ? (
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
					) : null}

					{items.length > 0 ? (
						<ProgressiveItemGroup
							items={items}
							renderItem={(item) => (
								<Item
									key={item.id}
									variant={item.readAt ? "default" : "outline"}
									role="listitem"
								>
									<ItemContent>
										<ItemTitle>{item.title}</ItemTitle>
										<ItemDescription>
											{item.body} · {new Date(item.createdAt).toLocaleString()}
										</ItemDescription>
									</ItemContent>
									{item.readAt ? null : (
										<ItemActions className="ml-auto w-full justify-end sm:w-auto">
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
							)}
						/>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Audit trail</CardTitle>
					<CardDescription>
						Publication, time-off decisions, and coverage assignments.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{audit.isLoading ? <Skeleton className="h-20" /> : null}
					{!audit.isLoading && events.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ScrollTextIcon />
								</EmptyMedia>
								<EmptyTitle>No manager actions yet</EmptyTitle>
								<EmptyDescription>
									Publishing a week or deciding a request writes an audit event.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}
					{events.length > 0 ? (
						<ProgressiveItemGroup
							items={events}
							renderItem={(event) => (
								<Item key={event.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>{event.summary}</ItemTitle>
										<ItemDescription>
											{event.actorName ? `${event.actorName} · ` : ""}
											{new Date(event.createdAt).toLocaleString()}
										</ItemDescription>
									</ItemContent>
								</Item>
							)}
						/>
					) : null}
				</CardContent>
			</Card>
		</section>
	);
}
