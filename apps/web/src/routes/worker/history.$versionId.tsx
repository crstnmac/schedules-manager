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
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CalendarDaysIcon } from "lucide-react";

import { usePublishedVersion } from "@/lib/queries";
import { formatDay, formatShiftRange } from "@/lib/time";

export const Route = createFileRoute("/worker/history/$versionId")({
	component: WorkerHistory,
});

function WorkerHistory() {
	const { versionId } = Route.useParams();
	const version = usePublishedVersion(versionId);
	const data = version.data;

	return (
		<section className="flex flex-col gap-4">
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				nativeButton={false}
				render={<Link to="/worker" />}
			>
				<ArrowLeftIcon data-icon="inline-start" />
				Back to my schedule
			</Button>

			{version.isLoading ? <Skeleton className="h-40" /> : null}

			{version.isError ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarDaysIcon />
						</EmptyMedia>
						<EmptyTitle>This published week is not available</EmptyTitle>
						<EmptyDescription>
							You can only open versions that belong to your workplace.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{data ? (
				<Card>
					<CardHeader>
						<CardTitle>Week of {formatDay(data.weekStart)}</CardTitle>
						<CardDescription>
							Published version {data.version.versionNumber} on{" "}
							{new Date(data.version.publishedAt).toLocaleString()}. Opening a
							past week does not mark it as seen.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{(data.shifts?.length ?? 0) === 0 ? (
							<p className="text-muted-foreground text-sm">
								You had no shifts on this published version.
							</p>
						) : (
							<ItemGroup>
								{data.shifts.map((shift) => (
									<Item key={shift.id} variant="outline" role="listitem">
										<ItemContent>
											<ItemTitle>
												{formatDay(shift.date)} ·{" "}
												{formatShiftRange(
													shift.startMinute,
													shift.endMinute,
													shift.overnight,
												)}
											</ItemTitle>
											<ItemDescription>
												{shift.positionName}
												{shift.note ? ` · ${shift.note}` : ""}
											</ItemDescription>
										</ItemContent>
									</Item>
								))}
							</ItemGroup>
						)}
					</CardContent>
				</Card>
			) : null}
		</section>
	);
}
