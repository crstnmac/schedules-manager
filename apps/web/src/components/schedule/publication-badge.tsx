import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@SchedulesManager/ui/components/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@SchedulesManager/ui/components/tooltip";
import { memo } from "react";

export const PublicationBadge = memo(function PublicationBadge({
	publication,
}: {
	publication: {
		latestVersionNumber: number | null;
		publishedAt: string | null;
		hasUnpublishedChanges: boolean;
		versions: {
			id: string;
			versionNumber: number;
			workers: {
				employmentId: string;
				name: string;
				status: "sent" | "delivered" | "acknowledged";
			}[];
		}[];
	};
}) {
	const published = publication.latestVersionNumber != null;
	const dirty = publication.hasUnpublishedChanges;
	const currentWorkers = published
		? (publication.versions.find(
				(version) => version.versionNumber === publication.latestVersionNumber,
			)?.workers ?? [])
		: [];
	const acknowledged = currentWorkers.filter(
		(worker) => worker.status === "acknowledged",
	).length;

	const badge = published ? (
		<Badge variant={dirty ? "secondary" : "default"}>
			{dirty
				? `Draft · v${publication.latestVersionNumber} live`
				: `Published v${publication.latestVersionNumber}`}
		</Badge>
	) : (
		<Badge variant="secondary">Draft</Badge>
	);

	if (!published) {
		return (
			<Tooltip>
				<TooltipTrigger render={<span className="inline-flex">{badge}</span>} />
				<TooltipContent>This week has not been published yet.</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Popover>
			<PopoverTrigger
				nativeButton={false}
				render={<span className="inline-flex">{badge}</span>}
			/>
			<PopoverContent align="end" className="w-64">
				<PopoverHeader>
					<PopoverTitle>
						{dirty
							? `Published v${publication.latestVersionNumber} · draft changes`
							: `Published v${publication.latestVersionNumber}`}
					</PopoverTitle>
					<PopoverDescription>
						{acknowledged} of {currentWorkers.length} workers have seen this
						version.
					</PopoverDescription>
				</PopoverHeader>
				{currentWorkers.length > 0 ? (
					<ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
						{currentWorkers.map((worker) => (
							<li
								key={worker.employmentId}
								className="flex items-center justify-between gap-2 text-xs"
							>
								<span className="truncate">{worker.name}</span>
								<Badge
									variant={
										worker.status === "acknowledged"
											? "default"
											: worker.status === "delivered"
												? "secondary"
												: "outline"
									}
								>
									{worker.status === "acknowledged"
										? "Seen"
										: worker.status === "delivered"
											? "Delivered"
											: "Sent"}
								</Badge>
							</li>
						))}
					</ul>
				) : null}
				{dirty ? (
					<p className="text-muted-foreground text-xs">
						Edit the draft, then publish to send the changes.
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
});
