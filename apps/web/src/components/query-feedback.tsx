import { Button } from "@SchedulesManager/ui/components/button";
import { Spinner } from "@SchedulesManager/ui/components/spinner";

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
			<div
				role="status"
				className="flex items-center gap-2 p-4 text-muted-foreground text-sm"
			>
				<Spinner /> Loading {label}…
			</div>
		);
	return null;
}
