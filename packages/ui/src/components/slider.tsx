"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

function Slider({
	className,
	"aria-label": ariaLabel,
	...props
}: SliderPrimitive.Root.Props<number> & {
	"aria-label"?: string;
}) {
	return (
		<SliderPrimitive.Root
			data-slot="slider"
			className={cn(
				"relative flex w-full touch-none select-none items-center",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Control
				data-slot="slider-control"
				className="relative flex w-full items-center"
			>
				<SliderPrimitive.Track
					data-slot="slider-track"
					className="relative h-1.5 w-full grow rounded-full bg-muted"
				>
					<SliderPrimitive.Indicator
						data-slot="slider-indicator"
						className="rounded-full bg-primary"
					/>
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						aria-label={ariaLabel}
						className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm outline-none transition-[box-shadow,transform] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-[dragging]:scale-110"
					/>
				</SliderPrimitive.Track>
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };
