import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { MegaphoneIcon } from "lucide-react";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { useAnnouncements } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/announcements")({
	component: WorkerAnnouncementsPage,
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
			<span className="tabular-nums text-muted-foreground">
				{new Date(getValue()).toLocaleString()}
			</span>
		),
	}),
	columnHelper.accessor("body", {
		header: "Body",
		cell: ({ getValue }) => (
			<span className="whitespace-pre-wrap text-muted-foreground">
				{getValue()}
			</span>
		),
	}),
]);

function WorkerAnnouncementsPage() {
	const { workplace } = useWorkplace();
	const announcements = useAnnouncements(workplace?.id);
	const rows = announcements.data?.announcements ?? [];

	return (
		<AppPage>
			<AppPageHeader
				title="Announcements"
				description="Updates shared with everyone at this workplace."
			/>
			<AppPageBody scroll={false}>
				{announcements.isLoading ? (
					<div className="flex flex-col gap-3 p-4">
						<Skeleton className="h-24" />
						<Skeleton className="h-24" />
					</div>
				) : (
					<DataTable
						columns={columns}
						data={rows}
						getRowId={(row) => row.id}
						empty={
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<MegaphoneIcon />
									</EmptyMedia>
									<EmptyTitle>No announcements yet</EmptyTitle>
									<EmptyDescription>
										New workplace announcements will appear here.
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
