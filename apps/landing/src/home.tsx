import { env } from "@SchedulesManager/env/landing";
import { AnimatedNumber, motion } from "@SchedulesManager/ui/components/motion";
import { fadeUp, staggerContainer } from "@SchedulesManager/ui/lib/motion";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	ArrowRight,
	ArrowUpRight,
	CalendarDays,
	Check,
	CircleDollarSign,
	Clock,
	Coffee,
	FileClock,
	HeartPulse,
	Layers,
	MapPin,
	Menu,
	Plus,
	Repeat,
	Send,
	ShoppingBag,
	Users,
	Utensils,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useId, useState } from "react";
import { Link } from "./router";
import { entityLine, isSet, LEGAL_ENTITY, withPeriod } from "./site-config";
import { competitors } from "./switching";
import "./home.css";

const appUrl = env.VITE_APP_URL;
const docsUrl = env.VITE_DOCS_URL;
const signUpUrl = new URL(appUrl);
signUpUrl.searchParams.set("mode", "sign-up");
const restaurantSignUpUrl = new URL(signUpUrl);
restaurantSignUpUrl.searchParams.set("opening_restaurant", "1");

const faqs = [
	[
		"Who is jooling for?",
		"jooling is built for hourly teams in hospitality, retail, healthcare, and beyond. Managers plan and publish schedules, while team members stay on top of their shifts and requests.",
	],
	[
		"Can my team use it on mobile?",
		"Yes. Teammates can check shifts, submit availability, and respond to schedule changes on the web or in the mobile app.",
	],
	[
		"What if the schedule changes?",
		"Affected teammates are notified when you publish a change. You can track acknowledgements, and important late changes can require their acceptance.",
	],
	[
		"Can I manage multiple locations?",
		"Yes. Create locations and roles, then give managers access to the teams and schedules they oversee.",
	],
	[
		"How does the free trial work?",
		"Every plan starts with 30 days free, and new restaurants can opt into a 90-day trial. You can invite your whole team and use the complete plan before your first charge, then manage or cancel billing at any time.",
	],
] as const;

const plans = [
	{
		id: "schedule",
		name: "Schedule",
		tagline: "For clear, dependable scheduling",
		perLocation: { monthly: 39, annual: 31 },
		features: [
			"Weekly schedules and reusable templates",
			"Availability, time off, open shifts, and swaps",
			"Versioned publishing and change history",
			"Team notifications and messaging",
			"Unlimited workers and managers",
		],
		recommended: false,
	},
	{
		id: "operations",
		name: "Operations",
		tagline: "For complete workforce operations",
		perLocation: { monthly: 79, annual: 63 },
		features: [
			"Everything in Schedule",
			"Time clock, kiosk, and geofencing",
			"Attendance, breaks, and timesheet approval",
			"Labor cost and overtime reporting",
			"Auto-assign and workforce controls",
		],
		recommended: true,
	},
] as const;

const locationRange = { min: 1, max: 25 };

const capabilities = [
	{
		icon: Repeat,
		title: "Open shifts & swaps",
		body: "Post uncovered work, let teammates pick it up or trade, and approve in one place.",
	},
	{
		icon: CalendarDays,
		title: "Availability & time off",
		body: "See who can work before you assign, with requests visible as you plan.",
	},
	{
		icon: FileClock,
		title: "Versioned publishing",
		body: "Every publish is a version. See what changed and who acknowledged it.",
	},
	{
		icon: Clock,
		title: "Time clock & kiosk",
		body: "Clock in by phone or shared kiosk, with geofencing and break tracking.",
	},
	{
		icon: CircleDollarSign,
		title: "Labor cost",
		body: "Track labor cost and overtime before the week goes out, not after.",
	},
	{
		icon: Layers,
		title: "Every location",
		body: "Roles and managers per location, each on its own clock and time zone.",
	},
];

function Brand() {
	return (
		<Link className="dk-brand" href="/" aria-label="jooling home">
			<img src="/logo-mark.svg" alt="" />
			jooling
		</Link>
	);
}

function PrimaryCTA({
	children = "Get started",
	href = signUpUrl.toString(),
	className,
}: {
	children?: React.ReactNode;
	href?: string;
	className?: string;
}) {
	return (
		<Link className={cn("dk-btn dk-btn-primary", className)} href={href}>
			{children}
			<ArrowUpRight aria-hidden="true" size={15} />
		</Link>
	);
}

function Reveal({
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

function SectionHeading({
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

function Announcement() {
	const [open, setOpen] = useState(true);
	if (!open) return null;
	return (
		<div className="dk-announcement">
			<p>
				<span className="dk-announcement-tag">New</span>
				Opening a restaurant? New restaurant workplaces get 90 days free.{" "}
				<Link href="#opening-restaurant">Read more</Link>
			</p>
			<button
				type="button"
				aria-label="Dismiss announcement"
				onClick={() => setOpen(false)}
			>
				<X size={14} />
			</button>
		</div>
	);
}

function Header() {
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
					<Link href="#how-it-works" onClick={close}>
						How it works
					</Link>
					<Link href="#for-your-team" onClick={close}>
						For your team
					</Link>
					<Link href="/restaurant" onClick={close}>
						Restaurants
					</Link>
					<Link href="/retail" onClick={close}>
						Retail
					</Link>
					<Link href="#pricing" onClick={close}>
						Pricing
					</Link>
					<Link href="#faq" onClick={close}>
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

function ScheduleShot() {
	return (
		<div className="dk-shot" id="product-demo">
			<img
				src="/schedule.webp"
				width={2940}
				height={1674}
				alt="The jooling weekly schedule in the web product, showing shifts by person and role, published version, open shifts and a conflict"
			/>
		</div>
	);
}

function Hero() {
	return (
		<motion.section
			className="dk-hero dk-container"
			initial="hidden"
			animate="visible"
			variants={staggerContainer(0.08, 0.04)}
		>
			<div className="dk-hero-split">
				<motion.h1 variants={fadeUp}>
					Employee scheduling software for hourly teams.
				</motion.h1>
				<motion.div className="dk-hero-aside" variants={fadeUp}>
					<p>
						Build and publish the week, handle changes as they happen, and keep
						everyone in sync. No worker fees — your whole team is included.
					</p>
					<div className="dk-hero-actions">
						<PrimaryCTA>Start 30 days free</PrimaryCTA>
						<Link className="dk-btn dk-btn-ghost" href="#product-demo">
							See it in action
						</Link>
					</div>
				</motion.div>
			</div>
			<motion.div variants={fadeUp}>
				<ScheduleShot />
			</motion.div>
		</motion.section>
	);
}

function Industries() {
	const items = [
		{ icon: Coffee, label: "Cafés & restaurants", href: "/restaurant" },
		{ icon: ShoppingBag, label: "Retail", href: "/retail" },
		{ icon: HeartPulse, label: "Healthcare" },
		{ icon: Utensils, label: "Hospitality" },
		{ icon: Users, label: "Your team, too" },
	];
	return (
		<section className="dk-industries dk-container" aria-label="Built for">
			<p>Built for hourly teams in</p>
			<div className="dk-industry-row">
				{items.map(({ icon: Icon, label, href }) =>
					href ? (
						<Link key={label} href={href}>
							<Icon size={16} /> {label}
							<ArrowUpRight size={12} className="dk-industry-arrow" />
						</Link>
					) : (
						<span key={label}>
							<Icon size={16} /> {label}
						</span>
					),
				)}
			</div>
		</section>
	);
}

const workflowSteps = [
	{
		id: "setup",
		icon: MapPin,
		title: "Set up your workplace",
		body: "Add each location, role, and teammate.",
	},
	{
		id: "build",
		icon: CalendarDays,
		title: "Build the schedule",
		body: "Assign shifts around availability and resolve uncovered work.",
	},
	{
		id: "publish",
		icon: Send,
		title: "Publish the week",
		body: "Notify the team and track acknowledgements.",
	},
	{
		id: "change",
		icon: FileClock,
		title: "Handle the change",
		body: "Keep later changes with the schedule, versioned and visible.",
	},
] as const;

function Workflow() {
	return (
		<section className="dk-section dk-container" id="how-it-works">
			<SectionHeading
				eyebrow="How it works"
				title="Set up. Schedule. Send."
				lede="Take the week from an empty workplace to a published schedule — and keep it right as the week moves."
			/>
			<ol className="dk-steps">
				{workflowSteps.map(({ id, icon: Icon, title, body }, index) => (
					<Reveal as="li" className="dk-step" key={id}>
						<span className="dk-step-index">0{index + 1}</span>
						<span className="dk-icon-tile">
							<Icon size={16} />
						</span>
						<h3>{title}</h3>
						<p>{body}</p>
					</Reveal>
				))}
			</ol>
		</section>
	);
}

function Capabilities() {
	return (
		<section className="dk-section dk-container" aria-labelledby="dk-cap-title">
			<Reveal as="header" className="dk-section-heading">
				<p className="dk-eyebrow">One place for the week</p>
				<h2 id="dk-cap-title">Everything around the schedule.</h2>
			</Reveal>
			<div className="dk-cap-grid">
				{capabilities.map(({ icon: Icon, title, body }) => (
					<Reveal className="dk-cap" key={title}>
						<span className="dk-icon-tile">
							<Icon size={16} />
						</span>
						<h3>{title}</h3>
						<p>{body}</p>
					</Reveal>
				))}
			</div>
		</section>
	);
}

function PhoneMockup() {
	return (
		<div className="dk-phone">
			<img
				src="/worker-home-mobile.webp"
				width={1170}
				height={2000}
				loading="lazy"
				alt="The jooling worker app showing the next shift, a published-schedule notice, and a shift change to accept"
			/>
		</div>
	);
}

function Team() {
	return (
		<section className="dk-section dk-container" id="for-your-team">
			<div className="dk-team">
				<Reveal className="dk-team-copy">
					<p className="dk-eyebrow">For your team</p>
					<h2>Built for managers. Loved by the team.</h2>
					<p className="dk-lede">
						The schedule is a big part of someone’s life. Give your people the
						clarity and flexibility to plan around it.
					</p>
					<ul className="dk-checklist">
						{[
							"The next shift, always easy to find",
							"Availability and time off, without the chase",
							"Clear updates when something changes",
							"A shared plan, on web and mobile",
						].map((item) => (
							<li key={item}>
								<Check size={14} /> {item}
							</li>
						))}
					</ul>
					<div className="dk-hero-actions">
						<PrimaryCTA />
						<Link className="dk-text-link dk-arrow-link" href="/worker-app">
							Explore the worker app <ArrowRight size={14} />
						</Link>
					</div>
				</Reveal>
				<Reveal className="dk-team-visual">
					<PhoneMockup />
				</Reveal>
			</div>
		</section>
	);
}

function Switching() {
	return (
		<section className="dk-section dk-container" id="switching">
			<div className="dk-split-cards">
				<Reveal className="dk-card">
					<p className="dk-eyebrow">Making a move?</p>
					<h2 className="dk-card-title">Bring your next week with you.</h2>
					<p className="dk-lede">
						Move your schedule into a draft, review it, then publish when it’s
						ready.
					</p>
					<nav className="dk-switch-list" aria-label="Switching guides">
						{competitors.map((competitor) => (
							<Link href={`/vs/${competitor.slug}`} key={competitor.slug}>
								<span>From {competitor.name}</span>
								<ArrowRight aria-hidden="true" size={14} />
							</Link>
						))}
					</nav>
				</Reveal>
				<Reveal className="dk-card" id="opening-restaurant">
					<p className="dk-eyebrow">Opening a restaurant?</p>
					<h2 className="dk-card-title">
						Make the first schedule before opening day.
					</h2>
					<p className="dk-lede">
						Set up roles and your team, start from a reusable weekly schedule,
						and publish only when the plan is ready. New restaurant workplaces
						can try jooling for 90 days at their first checkout.
					</p>
					<div className="dk-opening-stat">
						<span className="dk-opening-num">90</span>
						<span>
							days free
							<small>for new restaurant workplaces</small>
						</span>
					</div>
					<PrimaryCTA href={restaurantSignUpUrl.toString()}>
						Start 90 days free
					</PrimaryCTA>
				</Reveal>
			</div>
		</section>
	);
}

function Pricing() {
	const [annual, setAnnual] = useState(true);
	const [locations, setLocations] = useState(1);
	const interval = annual ? "annual" : "monthly";
	const sliderId = useId();
	const fill =
		((locations - locationRange.min) /
			(locationRange.max - locationRange.min)) *
		100;

	return (
		<section className="dk-section dk-container" id="pricing">
			<SectionHeading
				className="is-centered"
				eyebrow="Simple pricing"
				title="One price for the place. Everyone included."
				lede="Every feature, every worker. One clear price per location — slide to see what your workplaces would pay."
			/>
			<div className="dk-pricing-config">
				<fieldset className="dk-segmented">
					<legend className="dk-sr-only">Billing interval</legend>
					<button
						type="button"
						aria-pressed={!annual}
						className={cn(!annual && "is-active")}
						onClick={() => setAnnual(false)}
					>
						Monthly
					</button>
					<button
						type="button"
						aria-pressed={annual}
						className={cn(annual && "is-active")}
						onClick={() => setAnnual(true)}
					>
						Annual <span className="dk-save">−20%</span>
					</button>
				</fieldset>
				<div className="dk-range">
					<div className="dk-range-head">
						<label htmlFor={sliderId}>Locations</label>
						<output htmlFor={sliderId}>
							{locations} {locations === 1 ? "location" : "locations"}
						</output>
					</div>
					<input
						id={sliderId}
						type="range"
						min={locationRange.min}
						max={locationRange.max}
						value={locations}
						onChange={(event) => setLocations(Number(event.target.value))}
						style={{ "--fill": `${fill}%` } as React.CSSProperties}
					/>
					<div className="dk-range-scale">
						<span>{locationRange.min}</span>
						<span>{locationRange.max}</span>
					</div>
				</div>
			</div>
			<div className="dk-plans">
				{plans.map((plan) => {
					const price = plan.perLocation[interval];
					const monthlyTotal = price * locations;
					const yearlyTotal = plan.perLocation.annual * 12 * locations;
					return (
						<article
							className={cn("dk-plan", plan.recommended && "is-recommended")}
							key={plan.id}
						>
							<div className="dk-plan-head">
								<h3>{plan.name}</h3>
								{plan.recommended ? (
									<span className="dk-badge is-info">
										<i />
										Recommended
									</span>
								) : null}
							</div>
							<p className="dk-plan-tagline">{plan.tagline}</p>
							<div className="dk-plan-price">
								<span className="dk-plan-amount">
									$
									<AnimatedNumber
										value={monthlyTotal}
										format={(n) => Math.round(n).toString()}
									/>
								</span>
								<span className="dk-plan-unit">/ month</span>
							</div>
							<p className="dk-plan-detail">
								${price} per location · {locations}{" "}
								{locations === 1 ? "location" : "locations"}
								{annual
									? ` · billed $${yearlyTotal} yearly`
									: " · billed monthly"}
							</p>
							<ul className="dk-checklist">
								{plan.features.map((feature) => (
									<li key={feature}>
										<Check size={14} /> {feature}
									</li>
								))}
							</ul>
							<Link
								className={cn(
									"dk-btn dk-plan-cta",
									plan.recommended ? "dk-btn-primary" : "dk-btn-ghost",
								)}
								href={signUpUrl.toString()}
							>
								Start 30 days free
								<ArrowUpRight aria-hidden="true" size={15} />
							</Link>
						</article>
					);
				})}
			</div>
			<p className="dk-pricing-note">
				No worker fees. No setup fee. Your team keeps access to its schedule
				history.
			</p>
		</section>
	);
}

function Faq() {
	return (
		<section className="dk-section dk-container" id="faq">
			<div className="dk-faq">
				<SectionHeading
					eyebrow="Questions, answered"
					title="Glad you asked."
					lede={
						<>
							Everything your team needs to get started. More in the{" "}
							<Link className="dk-inline-link" href={docsUrl}>
								docs
							</Link>
							.
						</>
					}
				/>
				<div className="dk-faq-list">
					{faqs.map(([question, answer], index) => (
						<details key={question} open={index === 0}>
							<summary>
								{question}
								<Plus size={15} aria-hidden="true" />
							</summary>
							<p>{answer}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}

function Footer() {
	const entity = entityLine([LEGAL_ENTITY.legalName, LEGAL_ENTITY.address]);
	return (
		<>
			<section className="dk-final dk-container">
				<Reveal className="dk-final-card">
					<span className="dk-badge is-live">
						<i />
						Your week, sorted
					</span>
					<h2>Good weeks start with a clear plan.</h2>
					<p className="dk-lede">
						Build the schedule, bring your team along, and get back to the work
						that matters.
					</p>
					<div className="dk-hero-actions">
						<PrimaryCTA>Start 30 days free</PrimaryCTA>
						<Link className="dk-btn dk-btn-ghost" href={appUrl}>
							Log in
						</Link>
					</div>
				</Reveal>
			</section>
			<footer className="dk-footer">
				<div className="dk-container dk-footer-grid">
					<div className="dk-footer-intro">
						<Brand />
						<p>A calmer way to schedule hourly teams.</p>
					</div>
					<div className="dk-footer-col">
						<strong>Product</strong>
						<Link href="#how-it-works">How it works</Link>
						<Link href="#pricing">Pricing</Link>
						<Link href="#faq">FAQs</Link>
						<Link href={docsUrl}>Docs</Link>
					</div>
					<div className="dk-footer-col">
						<strong>For teams</strong>
						<Link href="#for-your-team">Team experience</Link>
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
		</>
	);
}

export function HomePage() {
	useEffect(() => {
		const root = document.documentElement;
		const meta = document.head.querySelector<HTMLMetaElement>(
			'meta[name="theme-color"]',
		);
		const previous = meta?.content;
		root.classList.add("dk-theme");
		if (meta) meta.content = "#0b0c0e";
		return () => {
			root.classList.remove("dk-theme");
			if (meta && previous) meta.content = previous;
		};
	}, []);

	return (
		<div className="dk">
			<Link className="dk-skip-link" href="#main-content">
				Skip to content
			</Link>
			<Announcement />
			<Header />
			<main id="main-content">
				<Hero />
				<Industries />
				<Workflow />
				<Capabilities />
				<Team />
				<Switching />
				<Pricing />
				<Faq />
			</main>
			<Footer />
		</div>
	);
}
