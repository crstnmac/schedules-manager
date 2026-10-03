import { env } from "@SchedulesManager/env/web";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { memo, useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import {
	useCalendarTokenDiagnostics,
	useCalendarTokens,
	useCreateMyCalendarToken,
	useRevokeCalendarToken,
} from "@/lib/queries";
import { formatDay } from "@/lib/time";

export const CalendarSyncCard = memo(function CalendarSyncCard({
	workplaceId,
	membershipEmploymentId,
}: {
	workplaceId: string | undefined;
	membershipEmploymentId: string | null | undefined;
}) {
	const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
	const calendarTokens = useCalendarTokens(workplaceId);
	const createCalendarToken = useCreateMyCalendarToken(workplaceId);
	const revokeCalendarToken = useRevokeCalendarToken(workplaceId);
	const myCalendarTokens = (calendarTokens.data ?? []).filter(
		(token) =>
			token.employmentId === membershipEmploymentId && !token.revokedAt,
	);
	const activeCalendarToken = myCalendarTokens[0] ?? null;
	const calendarDiagnostics = useCalendarTokenDiagnostics(
		workplaceId,
		activeCalendarToken?.id,
	);

	async function copyCalendarLink() {
		if (!calendarUrl) return;
		try {
			await navigator.clipboard.writeText(
				`${env.VITE_SERVER_URL}${calendarUrl}`,
			);
			toast.success("Calendar link copied.");
		} catch {
			toast.error("Couldn’t copy the calendar link.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Calendar sync</CardTitle>
				<CardDescription>
					Subscribe to your published schedule and approved leave in a calendar
					app.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{activeCalendarToken ? (
					<>
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<Badge variant="secondary">Active</Badge>
							<span className="text-muted-foreground text-xs">
								Created {formatDay(activeCalendarToken.createdAt)}
							</span>
						</div>
						{calendarUrl ? (
							<div className="flex items-center gap-2">
								<code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1 text-xs">
									{`${env.VITE_SERVER_URL}${calendarUrl}`}
								</code>
								<Button
									size="sm"
									variant="outline"
									onClick={() => void copyCalendarLink()}
								>
									<CopyIcon data-icon="inline-start" />
									Copy
								</Button>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								Create a new link to copy its URL again.
							</p>
						)}
						{calendarDiagnostics.data ? (
							<div className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
								<div className="flex items-center gap-2">
									<Badge
										variant={
											calendarDiagnostics.data.feedOk
												? "secondary"
												: "destructive"
										}
									>
										{calendarDiagnostics.data.feedOk ? "Feed OK" : "Revoked"}
									</Badge>
									<span>
										{calendarDiagnostics.data.eventCount} events ·{" "}
										{calendarDiagnostics.data.timezone}
									</span>
									<Button
										size="sm"
										variant="ghost"
										className="ml-auto h-6 px-2"
										disabled={calendarDiagnostics.isFetching}
										onClick={() => void calendarDiagnostics.refetch()}
									>
										<RefreshCwIcon data-icon="inline-start" />
										Run feed check
									</Button>
								</div>
								<p>
									Fetched {calendarDiagnostics.data.fetchCount} time
									{calendarDiagnostics.data.fetchCount === 1 ? "" : "s"}
									{calendarDiagnostics.data.lastUsedAt
										? ` · last fetched ${formatDay(calendarDiagnostics.data.lastUsedAt)}`
										: " · not fetched by an app yet"}
								</p>
								{calendarDiagnostics.data.lastFetchUserAgent ? (
									<p
										className="truncate"
										title={calendarDiagnostics.data.lastFetchUserAgent}
									>
										Last app: {calendarDiagnostics.data.lastFetchUserAgent}
									</p>
								) : null}
							</div>
						) : null}
						<div className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-xs">
							<p className="font-medium text-foreground">
								Add the link to your calendar app
							</p>
							<ul className="mt-1 list-disc space-y-0.5 pl-4">
								<li>
									Google Calendar — Settings → Add calendar → From URL. Google
									refreshes on its own schedule (about once a day).
								</li>
								<li>
									Apple Calendar — File → New Calendar Subscription (Mac), or
									Settings → Calendar → Accounts → Add Subscribed Calendar
									(iPhone).
								</li>
								<li>Outlook — Add calendar → Subscribe from web.</li>
							</ul>
						</div>
						<ConfirmAction
							trigger="Revoke link"
							triggerVariant="outline"
							title="Revoke this calendar link?"
							description="Calendar apps using this link will stop updating. You can create a new link later."
							confirmLabel="Revoke"
							destructive
							disabled={revokeCalendarToken.isPending}
							onConfirm={() =>
								revokeCalendarToken.mutate(activeCalendarToken.id, {
									onSuccess: () => {
										setCalendarUrl(null);
										toast.success("Calendar link revoked.");
									},
									onError: (error) => toast.error((error as Error).message),
								})
							}
						/>
					</>
				) : (
					<>
						<p className="text-muted-foreground text-sm">
							No personal calendar link yet. Create one to add your published
							schedule and approved leave to a calendar app.
						</p>
						<Button
							className="self-start"
							disabled={createCalendarToken.isPending}
							onClick={() =>
								createCalendarToken.mutate(undefined, {
									onSuccess: (result) => {
										setCalendarUrl(result.token.url ?? null);
										toast.success("Calendar link created.");
									},
									onError: (error) => toast.error((error as Error).message),
								})
							}
						>
							{createCalendarToken.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Create calendar link
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
});
