import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

import type { ShellLink } from "@/components/app-shell";
import type { InboxNotification } from "@/lib/queries";

export type ShellSearchLink = ShellLink & { description: string };

const RECENT_LIMIT = 5;

export function AppShellSearch({
	open,
	onOpenChange,
	links,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	links: ShellSearchLink[];
}) {
	const [query, setQuery] = useState("");
	const firstResult = useRef<HTMLAnchorElement>(null);
	const needle = query.trim().toLowerCase();
	const results = needle
		? links.filter((link) =>
				`${link.label} ${link.description}`.toLowerCase().includes(needle),
			)
		: links;
	const close = () => {
		onOpenChange(false);
		setQuery("");
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setQuery("");
			}}
		>
			<DialogContent className="gap-3 sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Jump to</DialogTitle>
					<DialogDescription>Search pages in this workspace.</DialogDescription>
				</DialogHeader>
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
					<input
						type="search"
						autoFocus
						aria-label="Search pages"
						placeholder="Search pages…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") firstResult.current?.click();
						}}
						className="h-9 w-full rounded-lg border bg-background pr-3 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					/>
				</div>
				<ul className="-mx-1 grid max-h-72 gap-0.5 overflow-y-auto px-1">
					{results.length === 0 ? (
						<li className="px-2 py-6 text-center text-muted-foreground text-sm">
							No pages match “{query.trim()}”.
						</li>
					) : null}
					{results.map((link, index) => (
						<li key={`${link.label}-${String(link.to)}`}>
							<Link
								ref={index === 0 ? firstResult : undefined}
								to={link.to}
								onClick={close}
								className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none focus-visible:bg-muted [@media(hover:hover)]:hover:bg-muted"
							>
								<link.icon className="size-4 shrink-0 text-muted-foreground" />
								<span className="grid min-w-0 leading-tight">
									<span className="truncate font-medium text-sm">
										{link.label}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{link.description}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}

const shortDate = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});

/** Right sidebar: shortcuts plus the latest notifications. */
export function AppShellAside({
	inbox,
	notifications,
	quickLinks,
}: {
	inbox: ShellLink & { unreadCount: number };
	notifications: InboxNotification[];
	quickLinks: ShellLink[];
}) {
	const recent = notifications.slice(0, RECENT_LIMIT);
	return (
		<aside
			aria-label="Highlights"
			className="hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto border-sidebar-border border-l p-4 xl:flex print:hidden"
		>
			{quickLinks.length > 0 ? (
				<section className="grid gap-2">
					<h2 className="font-medium text-sm">Quick links</h2>
					<ul className="grid gap-0.5 rounded-lg border bg-background p-1">
						{quickLinks.map((link) => (
							<li key={String(link.to)}>
								<Link
									to={link.to}
									className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:bg-muted [@media(hover:hover)]:hover:bg-muted"
								>
									<span className="grid size-6 place-items-center rounded-full border bg-sidebar text-muted-foreground">
										<link.icon className="size-3.5" />
									</span>
									{link.label}
								</Link>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<section className="grid gap-2">
				<div className="flex items-baseline justify-between gap-2">
					<h2 className="font-medium text-sm">Recent notifications</h2>
					<Link
						to={inbox.to}
						className="text-muted-foreground text-xs underline-offset-4 hover:underline"
					>
						View all
					</Link>
				</div>
				{recent.length === 0 ? (
					<p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
						You’re all caught up.
					</p>
				) : (
					<ul className="grid gap-1">
						{recent.map((item) => (
							<li key={item.id}>
								<Link
									to={inbox.to}
									className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 outline-none focus-visible:bg-background [@media(hover:hover)]:hover:bg-background"
								>
									<span
										aria-hidden="true"
										className={cn(
											"mt-1.5 size-2 shrink-0 rounded-full",
											item.readAt ? "bg-border" : "bg-primary",
										)}
									/>
									<span className="grid min-w-0 leading-snug">
										<span
											className={cn(
												"truncate text-sm",
												!item.readAt && "font-medium",
											)}
										>
											{item.title}
										</span>
										<span className="line-clamp-2 text-muted-foreground text-xs">
											{item.body}
										</span>
										<span className="text-muted-foreground text-xs">
											{shortDate(item.createdAt)}
										</span>
									</span>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</aside>
	);
}
