import { env } from "@SchedulesManager/env/web";
import { buttonVariants } from "@SchedulesManager/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@SchedulesManager/ui/components/tooltip";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { CircleHelpIcon } from "lucide-react";

export function DocsLink({ className }: { className?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<a
						aria-label="Open documentation"
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							className,
						)}
						href={env.VITE_DOCS_URL}
						rel="noreferrer"
						target="_blank"
					/>
				}
			>
				<CircleHelpIcon strokeWidth={1.5} />
			</TooltipTrigger>
			<TooltipContent side="bottom">Documentation</TooltipContent>
		</Tooltip>
	);
}
