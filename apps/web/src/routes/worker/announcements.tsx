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
import { useMemo, useState } from "react";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
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

function WorkerAnnouncementsPage() {
	const { workplace } = useWorkplace();
	const announcements = useAnnouncements(workplace?.id);
	const [search, setSearch] = useState("");
	const rows = announcements.data?.announcements ?? [];

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
				description="Updates shared with everyone at this workplace."
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
					{announcements.isLoading ? (
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="h-24" />
							<Skeleton className="h-24" />
						</div>
					) : (
						<DataTable
							fill={false}
							stacked
							query={announcements}
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
													? "New workplace announcements will appear here."
													: "Try a different search."}
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
