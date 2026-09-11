import { gsap, ScrollTrigger, useGSAP } from "@SchedulesManager/ui/lib/gsap";
import { preferReducedMotion } from "@SchedulesManager/ui/lib/motion";
import type { RefObject } from "react";

type ScrollRevealOptions = {
	/** Animate only matching descendants instead of the root element. */
	selector?: string;
	/** Vertical travel in pixels. */
	y?: number;
	/** Seconds between each target. */
	stagger?: number;
	duration?: number;
	/** ScrollTrigger start position. */
	start?: string;
};

/**
 * GSAP-owned entrance for a block of repeating elements such as a feature
 * list. Use it when a set needs to arrive as one choreographed gesture;
 * use the Framer Motion `Reveal` component for one-off blocks.
 */
export function useScrollReveal<T extends HTMLElement>(
	ref: RefObject<T | null>,
	{
		selector,
		y = 16,
		stagger = 0.08,
		duration = 0.55,
		start = "top 85%",
	}: ScrollRevealOptions = {},
) {
	useGSAP(
		() => {
			if (!ref.current || preferReducedMotion()) return;

			const targets = selector
				? ref.current.querySelectorAll(selector)
				: ref.current;
			if (targets instanceof NodeList && targets.length === 0) return;

			gsap.from(targets, {
				opacity: 0,
				y,
				duration,
				ease: "power3.out",
				stagger,
				scrollTrigger: {
					trigger: ref.current,
					start,
					once: true,
				},
			});
		},
		{ scope: ref },
	);
}

type ParallaxOptions = {
	/** Depth in pixels. Positive drifts down as the page scrolls up. */
	depth?: number;
	/** Starting scroll position for the scrub. */
	start?: string;
	/** Ending scroll position for the scrub. */
	end?: string;
};

/**
 * Scroll-scrubbed vertical drift for decorative layers. Motion is tied to
 * scroll position rather than time, so it never runs on its own.
 */
export function useParallax<T extends HTMLElement>(
	ref: RefObject<T | null>,
	{
		depth = 24,
		start = "top bottom",
		end = "bottom top",
	}: ParallaxOptions = {},
) {
	useGSAP(
		() => {
			if (!ref.current || preferReducedMotion()) return;

			gsap.fromTo(
				ref.current,
				{ y: -depth },
				{
					y: depth,
					ease: "none",
					scrollTrigger: {
						trigger: ref.current,
						start,
						end,
						scrub: true,
					},
				},
			);
		},
		{ scope: ref },
	);
}

export { ScrollTrigger };
