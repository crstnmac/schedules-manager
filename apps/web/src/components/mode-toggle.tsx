import { Button } from "@SchedulesManager/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
import { MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "@/components/theme-provider";

export function ModeToggle({ buttonClassName }: { buttonClassName?: string }) {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="icon" className={buttonClassName} />
				}
			>
				<SunIcon className="rotate-0 scale-100 opacity-100 blur-none motion-safe:transition-[rotate,scale,opacity,filter] motion-safe:duration-200 dark:-rotate-90 dark:scale-25 dark:opacity-0 dark:blur-[4px]" />
				<MoonIcon className="absolute rotate-90 scale-25 opacity-0 blur-[4px] motion-safe:transition-[rotate,scale,opacity,filter] motion-safe:duration-200 dark:rotate-0 dark:scale-100 dark:opacity-100 dark:blur-none" />
				<span className="sr-only">Toggle theme</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => setTheme("light")}>
						Light
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setTheme("dark")}>
						Dark
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setTheme("system")}>
						System
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
