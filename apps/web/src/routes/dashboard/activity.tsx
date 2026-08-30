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
import { BellIcon, ScrollTextIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
		<section className="flex flex-col gap-6">
			<PageHeader
				title="Activity"
				description="In-app notifications are the durable record. The audit trail shows manager actions for this workplace."
			/>

			<Card>
				<CardHeader>
					<CardTitle>Inbox</CardTitle>
					<CardDescription>
						Coverage requests, late-change responses, and time-off submissions.
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
						<ItemGroup>
							{events.map((event) => (
								<Item key={event.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>{event.summary}</ItemTitle>
										<ItemDescription>
											{event.actorName ? `${event.actorName} · ` : ""}
											{new Date(event.createdAt).toLocaleString()}
										</ItemDescription>
									</ItemContent>
								</Item>
							))}
						</ItemGroup>
					) : null}
				</CardContent>
			</Card>
		</section>
	);
}
