import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Field, FieldLabel } from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
	AppPageBody,
	AppPageHeader,
	AppPane,
	AppRail,
	AppSplit,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import { useAnnouncements } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/announcements")({
	component: AnnouncementsPage,
});

type AnnouncementRow = {
	id: string;
	title: string;
	body: string;
	author: string;
	createdAt: string;
};

const columnHelper = createDataColumnHelper<AnnouncementRow>();

const columns = columnHelper.columns([
	columnHelper.accessor("title", {
		header: "Title",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	columnHelper.accessor("author", { header: "Author" }),
	columnHelper.accessor("createdAt", {
		header: "Posted",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground tabular-nums">
				{new Date(getValue()).toLocaleString()}
			</span>
		),
	}),
	columnHelper.accessor("body", {
		header: "Body",
		cell: ({ getValue }) => (
			<span className="whitespace-pre-wrap break-words text-muted-foreground">
				{getValue()}
			</span>
		),
	}),
]);

function AnnouncementsPage() {
	const { workplace } = useWorkplace();
	const list = useAnnouncements(workplace?.id);
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const queryClient = useQueryClient();
	const post = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/announcements`, {
				method: "POST",
				body: { title: title.trim(), body: body.trim() },
			}),
		onSuccess: () => {
			setTitle("");
			setBody("");
			queryClient.invalidateQueries({ queryKey: ["announcements"] });
			toast.success("Announcement posted");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const rows = list.data?.announcements ?? [];

	return (
		<AppSplit>
			<AppPane>
				<AppPageHeader title="Announcements" />
				<AppPageBody scroll={false}>
					<DataTable
						query={list}
						columns={columns}
						data={rows}
						getRowId={(row) => row.id}
						empty={
							<Empty>
								<EmptyHeader>
									<EmptyTitle>No announcements yet</EmptyTitle>
									<EmptyDescription>
										Posted announcements will appear here.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						}
					/>
				</AppPageBody>
			</AppPane>
			<AppRail>
				<section className="flex flex-col gap-4 p-4">
					<div>
						<h2 className="font-heading font-medium text-sm">
							Post an announcement
						</h2>
						<p className="text-muted-foreground text-xs/relaxed">
							Everyone at this workplace is notified.
						</p>
					</div>
					<Field>
						<FieldLabel htmlFor="announcement-title">Title</FieldLabel>
						<Input
							id="announcement-title"
							maxLength={200}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Title"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="announcement-body">Message</FieldLabel>
						<Textarea
							id="announcement-body"
							value={body}
							onChange={(event) => setBody(event.target.value)}
							placeholder="What does your team need to know?"
						/>
					</Field>
					<Button
						onClick={() => post.mutate()}
						disabled={
							post.isPending ||
							title.trim().length === 0 ||
							body.trim().length === 0
						}
					>
						{post.isPending ? "Posting…" : "Post announcement"}
					</Button>
				</section>
			</AppRail>
		</AppSplit>
	);
}
