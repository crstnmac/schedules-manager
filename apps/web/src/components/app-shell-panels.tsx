import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

import type { ShellLink } from "@/components/app-shell";

export type ShellSearchLink = ShellLink & { description: string };

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
