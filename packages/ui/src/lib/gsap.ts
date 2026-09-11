import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/**
 * Register the GSAP plugins jooling uses. Safe to call repeatedly; the actual
 * registration happens once on the client.
 */
export function ensureGsap() {
	if (registered || typeof window === "undefined") return;
	gsap.registerPlugin(useGSAP, ScrollTrigger);
	registered = true;
}

ensureGsap();

export { gsap, ScrollTrigger, useGSAP };
