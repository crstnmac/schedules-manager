import { Button } from "@SchedulesManager/ui/components/button";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";

export type QueryFeedbackState = {
	isLoading: boolean;
	isError: boolean;
	isFetching: boolean;
	refetch: () => unknown;
};

export function QueryFeedback({
	query,
	label = "information",
}: {
	query: QueryFeedbackState;
	label?: string;
}) {
	if (query.isError)
		return (
			<div role="alert" className="flex flex-col items-start gap-3 p-4">
				<p className="font-medium text-sm">Couldn’t load {label}</p>
				<p className="text-muted-foreground text-sm">
					Check your connection and try again.
				</p>
				<Button
					variant="outline"
					disabled={query.isFetching}
					onClick={() => query.refetch()}
				>
					{query.isFetching ? "Retrying…" : "Try again"}
				</Button>
			</div>
		);
	if (query.isLoading)
		return (
			<div role="status" className="flex flex-col gap-2 p-4">
				<span className="sr-only">Loading {label}…</span>
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		);
	return null;
}
