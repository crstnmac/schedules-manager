import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
			<div className="flex min-w-0 flex-col gap-1">
				<h1 className="text-balance font-heading font-semibold text-xl tracking-tight">
					{title}
				</h1>
				{description ? (
					<p className="max-w-prose text-pretty text-muted-foreground text-sm/relaxed">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
