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

export function SettingsPage({
	title,
	description,
	children,
	className,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6", className)}>
			<header className="flex flex-col gap-1">
				<h1 className="font-medium text-base tracking-tight">{title}</h1>
				{description ? (
					<p className="max-w-prose text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</header>
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
		<Card size="sm" className={className}>
			{hasHeader ? (
				<CardHeader className="border-b">
					{title || typeof count === "number" ? (
						<div className="flex min-w-0 items-center gap-2">
							{title ? <CardTitle>{title}</CardTitle> : null}
							{typeof count === "number" ? (
								<Badge variant="secondary">{count}</Badge>
							) : null}
						</div>
					) : null}
					{description ? (
						<CardDescription>{description}</CardDescription>
					) : null}
					{action ? <CardAction>{action}</CardAction> : null}
				</CardHeader>
			) : null}
			<CardContent
				className={cn(hasHeader && "pt-(--card-spacing)", contentClassName)}
			>
				{children}
			</CardContent>
			{footer ? (
				<CardFooter className="border-t">{footer}</CardFooter>
			) : null}
		</Card>
	);
}
