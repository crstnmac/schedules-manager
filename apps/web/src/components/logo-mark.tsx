import { cn } from "@SchedulesManager/ui/lib/utils";

export function LogoMark({
	size = 40,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<img
			src="/logo-mark.svg"
			alt=""
			width={size}
			height={size}
			className={cn("shrink-0", className)}
		/>
	);
}
