import { buttonVariants } from "@SchedulesManager/ui/components/button";
import { cn } from "@SchedulesManager/ui/lib/utils";
import type React from "react";
import { Link } from "./router";

export function LandingLink({
	className,
	variant = "link",
	size = "default",
	...props
}: React.ComponentProps<"a"> & {
	variant?: "default" | "outline" | "secondary" | "ghost" | "link";
	size?: "default" | "xs" | "sm" | "lg";
}) {
	return (
		<Link
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}
