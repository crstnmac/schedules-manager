import type { Transition, Variants } from "motion/react";

/**
 * Motion tokens for jooling.
 *
 * Product surfaces stay calm: motion is short, mostly opacity + a few pixels of
 * travel, and always yields to `prefers-reduced-motion`. The shared values live
 * here so web and landing do not drift apart.
 */

export const duration = {
	instant: 0.1,
	fast: 0.16,
	base: 0.24,
	slow: 0.36,
	reveal: 0.5,
} as const;

export const ease = {
	/** Decisive exit, settles quickly. */
	out: [0.16, 1, 0.3, 1],
	outQuint: [0.22, 1, 0.36, 1],
	inOut: [0.65, 0, 0.35, 1],
} as const;

export const distance = {
	reveal: 10,
	enter: 8,
	nudge: 4,
} as const;

export const spring = {
	press: { type: "spring", stiffness: 550, damping: 34, mass: 0.7 },
	soft: { type: "spring", stiffness: 320, damping: 30, mass: 0.9 },
} satisfies Record<string, Transition>;

export const transition = {
	fast: { duration: duration.fast, ease: ease.out },
	base: { duration: duration.base, ease: ease.out },
	slow: { duration: duration.slow, ease: ease.outQuint },
	reveal: { duration: duration.reveal, ease: ease.outQuint },
} satisfies Record<string, Transition>;

export const fadeIn: Variants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: transition.base },
};

export const fadeUp: Variants = {
	hidden: { opacity: 0, y: distance.reveal },
	visible: { opacity: 1, y: 0, transition: transition.reveal },
};

export const fadeDown: Variants = {
	hidden: { opacity: 0, y: -distance.reveal },
	visible: { opacity: 1, y: 0, transition: transition.reveal },
};

export const scaleIn: Variants = {
	hidden: { opacity: 0, scale: 0.98 },
	visible: { opacity: 1, scale: 1, transition: transition.base },
};

/** Parent container that releases its children in sequence. */
export function staggerContainer(stagger = 0.05, delayChildren = 0): Variants {
	return {
		hidden: {},
		visible: {
			transition: { staggerChildren: stagger, delayChildren },
		},
	};
}

/** Yield to the operating system's reduced-motion setting. */
export function preferReducedMotion(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
