import { Badge } from "@SchedulesManager/ui/components/badge";
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
		<div className={cn("flex w-full flex-col gap-6", className)}>
			<header className="flex flex-col gap-1">
				<h1 className="font-medium text-base tracking-tight">{title}</h1>
				{description ? (
					<p className="max-w-prose text-muted-foreground text-sm">
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
				"grid items-start gap-6 xl:grid-cols-2 [&>*]:min-w-0",
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
		<section className={cn("flex min-w-0 flex-col gap-4", className)}>
			{hasHeader ? (
				<header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
					<div className="flex min-w-0 flex-col gap-1">
						{title || typeof count === "number" ? (
							<div className="flex min-w-0 items-center gap-2">
								{title ? (
									<h2 className="font-medium text-sm">{title}</h2>
								) : null}
								{typeof count === "number" ? (
									<Badge variant="secondary">{count}</Badge>
								) : null}
							</div>
						) : null}
						{description ? (
							<p className="text-muted-foreground text-sm">{description}</p>
						) : null}
					</div>
					{action}
				</header>
			) : null}
			<div className={contentClassName}>{children}</div>
			{footer ? (
				<div className="flex justify-end border-t pt-4">{footer}</div>
			) : null}
		</section>
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
