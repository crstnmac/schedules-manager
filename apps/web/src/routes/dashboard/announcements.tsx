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
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MegaphoneIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { FormSheet } from "@/components/form-sheet";
import {
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
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
		header: "Announcement",
		cell: ({ row }) => (
			<div className="flex flex-col gap-0.5">
				<span className="font-medium">{row.original.title}</span>
				<span className="line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground">
					{row.original.body}
				</span>
			</div>
		),
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
]);

function AnnouncementsPage() {
	const { workplace } = useWorkplace();
	const list = useAnnouncements(workplace?.id);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
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
			setOpen(false);
			queryClient.invalidateQueries({ queryKey: ["announcements"] });
			toast.success("Announcement posted");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const rows = list.data?.announcements ?? [];
	const filteredRows = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return rows;
		return rows.filter((row) =>
			`${row.title} ${row.body} ${row.author}`.toLowerCase().includes(term),
		);
	}, [rows, search]);
	const pagination = useTablePagination(filteredRows, { resetKey: search });

	return (
		<AppPage>
			<AppPageHeader
				title="Announcements"
				badge={<Badge variant="secondary">{rows.length}</Badge>}
				description="Everyone at this workplace is notified."
				actions={
					<Button size="sm" onClick={() => setOpen(true)}>
						<PlusIcon data-icon="inline-start" />
						Post announcement
					</Button>
				}
			/>
			<AppPageBody scroll={false}>
				<TableToolbar
					left={
						<TableSearch
							value={search}
							onValueChange={setSearch}
							placeholder="Search announcements"
						/>
					}
					right={<TablePagination {...pagination} />}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					<DataTable
						fill={false}
						stacked
						query={list}
						columns={columns}
						data={pagination.pageRows}
						getRowId={(row) => row.id}
						empty={
							<div className="p-4">
								<Empty className="border border-dashed">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<MegaphoneIcon />
										</EmptyMedia>
										<EmptyTitle>
											{rows.length === 0
												? "No announcements yet"
												: "No matches"}
										</EmptyTitle>
										<EmptyDescription>
											{rows.length === 0
												? "Post an announcement to notify everyone at this workplace."
												: "Try a different search."}
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</div>
						}
					/>
				</div>
			</AppPageBody>

			<FormSheet
				open={open}
				onOpenChange={setOpen}
				title="Post an announcement"
				description="Everyone at this workplace is notified."
				footer={
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							form="announcement-form"
							disabled={
								post.isPending ||
								title.trim().length === 0 ||
								body.trim().length === 0
							}
						>
							{post.isPending ? <Spinner data-icon="inline-start" /> : null}
							{post.isPending ? "Posting…" : "Post announcement"}
						</Button>
					</div>
				}
			>
				<form
					id="announcement-form"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						post.mutate();
					}}
				>
					<Field>
						<FieldLabel htmlFor="announcement-title">Title</FieldLabel>
						<Input
							id="announcement-title"
							maxLength={200}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Title"
							autoFocus
							required
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="announcement-body">Message</FieldLabel>
						<Textarea
							id="announcement-body"
							value={body}
							onChange={(event) => setBody(event.target.value)}
							placeholder="What does your team need to know?"
							required
						/>
					</Field>
				</form>
			</FormSheet>
		</AppPage>
	);
}
