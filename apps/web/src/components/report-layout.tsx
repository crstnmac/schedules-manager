import type { ReactNode } from "react";

export function ReportSectionHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div className="shrink-0">
				<h2 className="font-heading font-medium text-sm">{title}</h2>
				<p className="text-muted-foreground text-xs/relaxed">{description}</p>
			</div>
			{actions ? (
				<div className="flex flex-wrap items-end gap-2 sm:ml-auto sm:justify-end">
					{actions}
				</div>
			) : null}
		</div>
	);
}

export function ReportMetricGrid({ children }: { children: ReactNode }) {
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
	);
}
