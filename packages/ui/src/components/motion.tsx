"use client";

import {
	fadeUp,
	spring,
	staggerContainer,
	transition,
} from "@SchedulesManager/ui/lib/motion";
import {
	AnimatePresence,
	MotionConfig,
	type MotionProps,
	motion,
	useInView,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "motion/react";
import type * as React from "react";
import { useEffect } from "react";

export {
	AnimatePresence,
	type MotionProps,
	motion,
	useInView,
	useReducedMotion,
};

/**
 * App-level wrapper. `reducedMotion="user"` strips transform and layout
 * animation when the operating system asks for less motion, while keeping
 * opacity so state changes still read.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
	return (
		<MotionConfig reducedMotion="user" transition={transition.fast}>
			{children}
		</MotionConfig>
	);
}

type RevealProps = {
	children: React.ReactNode;
	className?: string;
	/** Seconds to wait before revealing. */
	delay?: number;
	/** Reveal on mount instead of on scroll into view. */
	onMount?: boolean;
	as?: "div" | "span" | "li";
} & Pick<MotionProps, "style">;

const revealTags = {
	div: motion.div,
	span: motion.span,
	li: motion.li,
} as const;

/**
 * A single element that fades and lifts into place. Use for headings, cards,
 * and any block that should arrive with intent rather than pop in.
 */
export function Reveal({
	children,
	className,
	delay = 0,
	onMount = false,
	as = "div",
	style,
}: RevealProps) {
	const Component = revealTags[as];
	const viewport = { once: true, amount: 0.25 } as const;

	return (
		<Component
			className={className}
			style={style}
			initial="hidden"
			animate={onMount ? "visible" : undefined}
			whileInView={onMount ? undefined : "visible"}
			viewport={onMount ? undefined : viewport}
			variants={{
				hidden: { opacity: 0, y: 10 },
				visible: {
					opacity: 1,
					y: 0,
					transition: { ...transition.reveal, delay },
				},
			}}
		>
			{children}
		</Component>
	);
}

type StaggerProps = {
	children: React.ReactNode;
	className?: string;
	/** Seconds between each child. */
	step?: number;
	delay?: number;
	onMount?: boolean;
};

/** Releases its direct `StaggerItem` children in sequence. */
export function Stagger({
	children,
	className,
	step = 0.05,
	delay = 0,
	onMount = false,
}: StaggerProps) {
	const viewport = { once: true, amount: 0.2 } as const;

	return (
		<motion.div
			className={className}
			initial="hidden"
			animate={onMount ? "visible" : undefined}
			whileInView={onMount ? undefined : "visible"}
			viewport={onMount ? undefined : viewport}
			variants={staggerContainer(step, delay)}
		>
			{children}
		</motion.div>
	);
}

export function StaggerItem({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div className={className} variants={fadeUp}>
			{children}
		</motion.div>
	);
}

/** A surface that lifts slightly on hover and settles under the pointer. */
export function HoverLift({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			className={className}
			whileHover={{ y: -2 }}
			transition={spring.soft}
		>
			{children}
		</motion.div>
	);
}

/**
 * Fade-only route transition. Deliberately transform-free so sticky headers,
 * fixed layers, and independently scrolling panes keep their bearings while
 * the new screen settles in.
 */
export function PageFade({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			className={className}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={transition.base}
		>
			{children}
		</motion.div>
	);
}

/**
 * Numeric counter that eases to a new value. Falls back to the plain value
 * when reduced motion is requested or during server rendering.
 */
export function AnimatedNumber({
	value,
	format = (n) => Math.round(n).toLocaleString(),
	className,
}: {
	value: number;
	format?: (value: number) => string;
	className?: string;
}) {
	const reduced = useReducedMotion();
	const source = useMotionValue(value);
	const smoothed = useSpring(source, spring.soft);
	const text = useTransform(smoothed, (latest) => format(latest));

	useEffect(() => {
		source.set(value);
	}, [source, value]);

	if (reduced) {
		return <span className={className}>{format(value)}</span>;
	}

	return <motion.span className={className}>{text}</motion.span>;
}
