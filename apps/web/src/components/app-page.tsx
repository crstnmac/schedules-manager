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
				"flex shrink-0 flex-wrap items-start justify-between gap-2 border-b px-4 py-3",
				className,
			)}
		>
			{title || description || badge ? (
				<div className="min-w-0">
					{title ? (
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-heading font-medium text-sm">{title}</h2>
							{badge}
						</div>
					) : null}
					{description ? (
						<p className="text-muted-foreground text-xs/relaxed">
							{description}
						</p>
					) : null}
				</div>
			) : null}
			{actions}
			{children}
		</header>
	);
}

export function AppPageBody({
	children,
	className,
	scroll = true,
}: {
	children: ReactNode;
	className?: string;
	scroll?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col",
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
					"mx-auto flex w-full flex-col gap-6 px-4 py-4 md:px-6",
					widthClassName,
					className,
				)}
			>
				{children}
			</div>
		</section>
	);
}
