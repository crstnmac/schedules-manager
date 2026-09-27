import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { cn } from "@SchedulesManager/ui/lib/utils";
import type { ReactNode } from "react";

import {
	QueryFeedback,
	type QueryFeedbackState,
} from "@/components/query-feedback";

export function SettingsPage({
	title,
	description,
	children,
	className,
	queries = [],
}: {
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
	queries?: (QueryFeedbackState & { data?: unknown })[];
}) {
	const blocked = queries.find(
		(query) => query.data === undefined && (query.isLoading || query.isError),
	);
	return (
		<div
			className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", className)}
		>
			<header className="flex flex-col gap-1.5">
				<h1 className="text-balance font-heading font-semibold text-xl tracking-tight md:text-2xl">
					{title}
				</h1>
				{description ? (
					<p className="max-w-prose text-pretty text-muted-foreground text-sm/relaxed">
						{description}
					</p>
				) : null}
			</header>
			{blocked ? (
				<QueryFeedback query={blocked} label={title.toLowerCase()} />
			) : (
				children
			)}
		</div>
	);
}

/**
 * Lays out independent settings sections. Single column by default, two columns
 * once there is room, so pages use the full width without stretching content.
 */
export function SettingsColumns({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid items-start gap-4 xl:grid-cols-2 [&>*]:min-w-0",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function SettingsSection({
	title,
	description,
	count,
	action,
	footer,
	children,
	className,
	contentClassName,
}: {
	title?: string;
	description?: string;
	count?: number;
	action?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}) {
	const hasHeader =
		Boolean(title) ||
		Boolean(description) ||
		typeof count === "number" ||
		Boolean(action);

	return (
		<Card className={cn("min-w-0", className)}>
			{hasHeader ? (
				<CardHeader className="border-b">
					{title || typeof count === "number" ? (
						<CardTitle className="flex min-w-0 items-center gap-2 font-semibold">
							{title ? <h2 className="text-balance">{title}</h2> : null}
							{typeof count === "number" ? (
								<Badge variant="secondary" className="tabular-nums">
									{count}
								</Badge>
							) : null}
						</CardTitle>
					) : null}
					{description ? (
						<CardDescription>{description}</CardDescription>
					) : null}
					{action ? <CardAction>{action}</CardAction> : null}
				</CardHeader>
			) : null}
			<CardContent className={cn("min-w-0", contentClassName)}>
				{children}
			</CardContent>
			{footer ? (
				<CardFooter className="justify-end gap-2 py-3">{footer}</CardFooter>
			) : null}
		</Card>
	);
}

export function SettingsSaveSection({
	message,
	footer,
}: {
	message: string;
	footer: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
			<p className="text-muted-foreground text-sm">{message}</p>
			{footer}
		</div>
	);
}
