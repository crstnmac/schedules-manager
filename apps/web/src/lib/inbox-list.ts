import type { ListFilter, ListSort } from "@/components/list-view";
import type { InboxNotification } from "@/lib/queries";

/** Filters, sorts, and selection shared by every notification inbox. */
export const INBOX_FILTERS: ListFilter<InboxNotification>[] = [
	{
		id: "read",
		label: "Read state",
		options: [
			{ label: "Unread", value: "unread" },
			{ label: "Read", value: "read" },
		],
		value: (item) => (item.readAt ? "read" : "unread"),
	},
];

export const INBOX_SORTS: ListSort<InboxNotification>[] = [
	{
		id: "createdAt",
		label: "When",
		compare: (a, b) => a.createdAt.localeCompare(b.createdAt),
	},
	{
		id: "title",
		label: "Notification",
		compare: (a, b) => a.title.localeCompare(b.title),
	},
];

export const searchNotification = (item: InboxNotification) => [
	item.title,
	item.body,
];
export const notificationId = (item: InboxNotification) => item.id;
export const isUnread = (item: InboxNotification) => !item.readAt;
