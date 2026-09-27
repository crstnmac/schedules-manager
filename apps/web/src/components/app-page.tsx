import { cn } from "@SchedulesManager/ui/lib/utils";
import type { ReactNode } from "react";

export function AppPage({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
				className,
			)}
		>
			{children}
		</section>
	);
}

export function AppSplit({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row",
				className,
			)}
		>
			{children}
		</section>
	);
}

export function AppPane({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function AppRail({
	children,
	className,
	widthClassName = "lg:w-80",
}: {
	children: ReactNode;
	className?: string;
	widthClassName?: string;
}) {
	return (
		<aside
			className={cn(
				"flex max-h-[45vh] min-h-0 w-full shrink-0 flex-col overflow-y-auto border-t bg-muted/20 lg:max-h-none lg:border-t-0 lg:border-l",
				widthClassName,
				className,
			)}
		>
			{children}
		</aside>
	);
}

export function AppPageHeader({
	title,
	description,
	badge,
	actions,
	children,
	className,
}: {
	title?: ReactNode;
	description?: ReactNode;
	badge?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-5 pb-4 md:px-6 md:pt-6",
				className,
			)}
		>
			{title || description || badge ? (
				<div className="flex min-w-0 flex-col gap-1">
					{title ? (
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-balance font-heading font-semibold text-xl tracking-tight md:text-2xl">
								{title}
							</h1>
							{badge}
						</div>
					) : null}
					{description ? (
						<p className="max-w-prose text-pretty text-muted-foreground text-sm/relaxed">
							{description}
						</p>
					) : null}
				</div>
			) : null}
			{actions ? (
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			) : null}
			{children}
		</header>
	);
}

/**
 * The working area below a page header. Fixed-height bodies (tables, lists)
 * render as one framed panel so the toolbar, rows, and empty state read as a
 * single surface; scrolling bodies keep the page gutter and hold their own
 * cards.
 */
export function AppPageBody({
	children,
	className,
	scroll = true,
	panel = !scroll,
}: {
	children: ReactNode;
	className?: string;
	scroll?: boolean;
	panel?: boolean;
}) {
	if (panel) {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 md:px-6 md:pb-6">
				<div
					data-slot="app-panel"
					className={cn(
						"flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-card shadow-xs ring-1 ring-foreground/10",
						scroll ? "overflow-y-auto" : "overflow-hidden",
						className,
					)}
				>
					{children}
				</div>
			</div>
		);
	}
	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-6 md:px-6",
				scroll ? "overflow-y-auto" : "overflow-hidden",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function AppDocument({
	children,
	className,
	widthClassName = "max-w-3xl",
}: {
	children: ReactNode;
	className?: string;
	widthClassName?: string;
}) {
	return (
		<section className="min-h-0 flex-1 overflow-y-auto">
			<div
				className={cn(
					"mx-auto flex w-full flex-col gap-6 px-4 py-5 md:px-6 md:py-6",
					widthClassName,
					className,
				)}
			>
				{children}
			</div>
		</section>
	);
}
