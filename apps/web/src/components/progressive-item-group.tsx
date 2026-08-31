import { Button } from "@SchedulesManager/ui/components/button";
import { ItemGroup } from "@SchedulesManager/ui/components/item";
import { type ReactNode, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 40;

export function ProgressiveItemGroup<T>({
	items,
	renderItem,
	pageSize = DEFAULT_PAGE_SIZE,
}: {
	items: T[];
	renderItem: (item: T) => ReactNode;
	pageSize?: number;
}) {
	const [visibleCount, setVisibleCount] = useState(pageSize);
	const visibleItems = useMemo(
		() => items.slice(0, visibleCount),
		[items, visibleCount],
	);
	const remaining = Math.max(0, items.length - visibleItems.length);

	return (
		<div className="grid gap-3">
			<ItemGroup className="large-data-list gap-2">
				{visibleItems.map(renderItem)}
			</ItemGroup>
			{remaining > 0 ? (
				<Button
					variant="outline"
					size="sm"
					className="justify-self-center"
					onClick={() => setVisibleCount((count) => count + pageSize)}
				>
					Show {Math.min(pageSize, remaining)} more
				</Button>
			) : null}
		</div>
	);
}
