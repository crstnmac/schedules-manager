import { env } from "@SchedulesManager/env/landing";
import { motion } from "@SchedulesManager/ui/components/motion";
import { fadeUp } from "@SchedulesManager/ui/lib/motion";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { ArrowUpRight, Menu, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Link, usePathname } from "./router";
import { entityLine, isSet, LEGAL_ENTITY, withPeriod } from "./site-config";
import "./home.css";
import "./pages.css";

export const appUrl = env.VITE_APP_URL;
export const docsUrl = env.VITE_DOCS_URL;
export const signUpUrl = new URL(appUrl);
signUpUrl.searchParams.set("mode", "sign-up");

export function Brand() {
	return (
		<Link className="dk-brand" href="/" aria-label="jooling home">
			<img src="/logo-mark.svg" alt="" />
			jooling
		</Link>
	);
}

export function PrimaryCTA({
	children = "Get started",
	href = signUpUrl.toString(),
	className,
	onClick,
}: {
	children?: React.ReactNode;
	href?: string;
	className?: string;
	onClick?: () => void;
}) {
	return (
		<Link
			className={cn("dk-btn dk-btn-primary", className)}
			href={href}
			onClick={onClick}
		>
			{children}
			<ArrowUpRight aria-hidden="true" size={15} />
		</Link>
	);
}

export function Reveal({
	children,
	className,
	as = "div",
	id,
}: {
	children: React.ReactNode;
	className?: string;
	as?: "div" | "header" | "li";
	id?: string;
}) {
	const Component =
		as === "header" ? motion.header : as === "li" ? motion.li : motion.div;
	return (
		<Component
			id={id}
			className={className}
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, amount: 0.3 }}
			variants={fadeUp}
		>
			{children}
		</Component>
	);
}

export function SectionHeading({
	eyebrow,
	title,
	lede,
	className,
}: {
	eyebrow: string;
	title: React.ReactNode;
	lede?: React.ReactNode;
	className?: string;
}) {
	return (
		<Reveal as="header" className={cn("dk-section-heading", className)}>
			<p className="dk-eyebrow">{eyebrow}</p>
			<h2>{title}</h2>
			{lede ? <p className="dk-lede">{lede}</p> : null}
		</Reveal>
	);
}

function SiteHeader() {
	const onHome = usePathname() === "/";
	const home = onHome ? "" : "/";
	const [menuOpen, setMenuOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const update = () => setScrolled(window.scrollY > 8);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, []);

	const close = () => setMenuOpen(false);

	return (
		<header
			className={cn(
				"dk-header",
				scrolled && "is-scrolled",
				menuOpen && "is-open",
			)}
		>
			<div className="dk-header-inner">
				<Brand />
				<nav
					id="main-navigation"
					aria-label="Main navigation"
					className="dk-nav"
				>
					<Link href={`${home}#how-it-works`} onClick={close}>
						How it works
					</Link>
					<Link href={`${home}#for-your-team`} onClick={close}>
						For your team
					</Link>
					<Link href="/restaurant" onClick={close}>
						Restaurants
					</Link>
					<Link href="/retail" onClick={close}>
						Retail
					</Link>
					<Link href={`${home}#pricing`} onClick={close}>
						Pricing
					</Link>
					<Link href={`${home}#faq`} onClick={close}>
						FAQs
					</Link>
					<Link href={docsUrl} onClick={close}>
						Docs
					</Link>
					<Link className="dk-nav-mobile-only" href={appUrl} onClick={close}>
						Log in
					</Link>
				</nav>
				<div className="dk-header-actions">
					<Link className="dk-text-link dk-login" href={appUrl}>
						Log in
					</Link>
					<PrimaryCTA className="dk-header-cta">Get started</PrimaryCTA>
					<button
						type="button"
						className="dk-menu-toggle"
						aria-label={menuOpen ? "Close navigation" : "Open navigation"}
						aria-expanded={menuOpen}
						aria-controls="main-navigation"
						onClick={() => setMenuOpen(!menuOpen)}
					>
						{menuOpen ? <X size={18} /> : <Menu size={18} />}
					</button>
				</div>
			</div>
		</header>
	);
}

export function FinalCTA({
	badge = "Your week, sorted",
	title = "Good weeks start with a clear plan.",
	body = "Build the schedule, bring your team along, and get back to the work that matters.",
	cta = "Start 30 days free",
	href,
	onClick,
}: {
	badge?: string;
	title?: React.ReactNode;
	body?: React.ReactNode;
	cta?: React.ReactNode;
	href?: string;
	onClick?: () => void;
}) {
	return (
		<section className="dk-final dk-container">
			<Reveal className="dk-final-card">
				<span className="dk-badge is-live">
					<i />
					{badge}
				</span>
				<h2>{title}</h2>
				<p className="dk-lede">{body}</p>
				<div className="dk-hero-actions">
					<PrimaryCTA href={href} onClick={onClick}>
						{cta}
					</PrimaryCTA>
					<Link className="dk-btn dk-btn-ghost" href={appUrl}>
						Log in
					</Link>
				</div>
			</Reveal>
		</section>
	);
}

function SiteFooter() {
	const home = usePathname() === "/" ? "" : "/";
	const entity = entityLine([LEGAL_ENTITY.legalName, LEGAL_ENTITY.address]);
	return (
		<footer className="dk-footer">
			<div className="dk-container dk-footer-grid">
				<div className="dk-footer-intro">
					<Brand />
					<p>A calmer way to schedule hourly teams.</p>
				</div>
				<div className="dk-footer-col">
					<strong>Product</strong>
					<Link href={`${home}#how-it-works`}>How it works</Link>
					<Link href={`${home}#pricing`}>Pricing</Link>
					<Link href={`${home}#faq`}>FAQs</Link>
					<Link href={docsUrl}>Docs</Link>
				</div>
				<div className="dk-footer-col">
					<strong>For teams</strong>
					<Link href={`${home}#for-your-team`}>Team experience</Link>
					<Link href="/worker-app">Worker app</Link>
					<Link href="/restaurant">Restaurants</Link>
					<Link href="/retail">Retail</Link>
				</div>
				<div className="dk-footer-col">
					<strong>Account</strong>
					<Link href={appUrl}>Log in</Link>
					<Link href={signUpUrl.toString()}>Get started</Link>
				</div>
			</div>
			<div className="dk-container dk-footer-bottom">
				<span>
					© {new Date().getFullYear()}
					{isSet(LEGAL_ENTITY.legalName)
						? ` ${withPeriod(LEGAL_ENTITY.legalName)}`
						: " jooling"}
				</span>
				<nav aria-label="Legal">
					<Link href="/privacy">Privacy Policy</Link>
					<Link href="/terms">Terms &amp; Conditions</Link>
					<Link href="/dpa">DPA</Link>
				</nav>
			</div>
			{entity ? (
				<div className="dk-container dk-footer-entity">{entity}</div>
			) : null}
		</footer>
	);
}

export function DarkPage({
	children,
	before,
}: {
	children: React.ReactNode;
	before?: React.ReactNode;
}) {
	return (
		<div className="dk">
			<Link className="dk-skip-link" href="#main-content">
				Skip to content
			</Link>
			{before}
			<SiteHeader />
			<main id="main-content">{children}</main>
			<SiteFooter />
		</div>
	);
}
