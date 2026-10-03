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
	Plus,
	Repeat,
	Send,
	ShoppingBag,
	Users,
	Utensils,
	X,
} from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { Link } from "./router";
import {
	DarkPage,
	docsUrl,
	FinalCTA,
	PrimaryCTA,
	Reveal,
	SectionHeading,
	signUpUrl,
} from "./site-shell";
import { competitors } from "./switching";
import { ThemedImage } from "./theme";

const restaurantSignUpUrl = new URL(signUpUrl);
restaurantSignUpUrl.searchParams.set("opening_restaurant", "1");

const faqs = [
	[
		"Who is jooling for?",
		"jooling is for hourly teams in restaurants, retail, healthcare, and hotels. Managers make and publish schedules. Workers see their shifts and send requests.",
	],
	[
		"Can my workers use it on a phone?",
		"Yes. Workers can see their shifts, send their availability, and answer schedule changes. They can do this on the web or in the mobile app.",
	],
	[
		"What happens when the schedule changes?",
		"When you publish a change, jooling tells the workers it affects. You can see who acknowledged the change. For an important late change, the worker must accept it.",
	],
	[
		"Can I manage more than one location?",
		"Yes. Add your locations and roles. Then give each manager access to the schedules they control.",
	],
	[
		"How does the free trial work?",
		"Each plan starts with 30 days free. A new restaurant can get a 90-day trial. Invite all your workers and use the full plan before the first charge. You can change or cancel your billing at any time.",
	],
] as const;

const plans = [
	{
		id: "schedule",
		name: "Schedule",
		tagline: "For simple, reliable scheduling",
		perLocation: { monthly: 39, annual: 31 },
		features: [
			"Weekly schedules and templates you can use again",
			"Availability, time off, open shifts, and shift swaps",
			"Schedule versions and change history",
			"Notifications and messages for workers",
			"No limit on workers and managers",
		],
		recommended: false,
	},
	{
		id: "operations",
		name: "Operations",
		tagline: "For full workforce operations",
		perLocation: { monthly: 79, annual: 63 },
		features: [
			"Everything in Schedule",
			"Time clock, kiosk, and geofence",
			"Attendance, breaks, and timesheet approval",
			"Labor cost and overtime reports",
			"Auto-assign and workforce controls",
		],
		recommended: true,
	},
] as const;

const locationRange = { min: 1, max: 25 };

const capabilities = [
	{
		icon: Repeat,
		title: "Open shifts and swaps",
		body: "Post a shift that has no worker. Workers can take it or swap it. You approve it in one place.",
	},
	{
		icon: CalendarDays,
		title: "Availability and time off",
		body: "See who can work before you assign a shift. See time-off requests as you plan.",
	},
	{
		icon: FileClock,
		title: "Schedule versions",
		body: "Each publish makes a new version. See what changed and who acknowledged it.",
	},
	{
		icon: Clock,
		title: "Time clock and kiosk",
		body: "Workers start work on a phone or a shared kiosk. The geofence and break records help you check the time.",
	},
	{
		icon: CircleDollarSign,
		title: "Labor cost",
		body: "See labor cost and overtime before you publish the week.",
	},
	{
		icon: Layers,
		title: "All locations",
		body: "Each location has its own roles, managers, and time zone.",
	},
];

function Announcement() {
	const [open, setOpen] = useState(true);
	if (!open) return null;
	return (
		<div className="dk-announcement">
			<p>
				<span className="dk-announcement-tag">New</span>
				Do you open a restaurant? A new restaurant workplace gets 90 days free.{" "}
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

function ScheduleShot() {
	return (
		<div className="dk-shot" id="product-demo">
			<ThemedImage
				name="product-schedule"
				width={2940}
				height={1720}
				alt="The jooling weekly schedule on the web. It shows shifts for each worker and role, the published version, open shifts, and a conflict"
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
					Scheduling software for hourly teams.
				</motion.h1>
				<motion.div className="dk-hero-aside" variants={fadeUp}>
					<p>
						Make and publish the week. Do changes when they occur. Keep everyone informed.
						There is no fee for workers.
					</p>
					<div className="dk-hero-actions">
						<PrimaryCTA>Start 30 days free</PrimaryCTA>
						<Link className="dk-btn dk-btn-ghost" href="#product-demo">
							See the product
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
		{ icon: Coffee, label: "Cafés and restaurants", href: "/restaurant" },
		{ icon: ShoppingBag, label: "Retail", href: "/retail" },
		{ icon: HeartPulse, label: "Healthcare" },
		{ icon: Utensils, label: "Hotels" },
		{ icon: Users, label: "Your team" },
	];
	return (
		<section className="dk-industries dk-container" aria-label="Built for">
			<p>For hourly teams in</p>
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
		body: "Add each location, role, and worker.",
	},
	{
		id: "build",
		icon: CalendarDays,
		title: "Make the schedule",
		body: "Assign shifts to match availability. Fill shifts that have no worker.",
	},
	{
		id: "publish",
		icon: Send,
		title: "Publish the week",
		body: "Tell the workers. See who acknowledged.",
	},
	{
		id: "change",
		icon: FileClock,
		title: "Do a change",
		body: "Each later change is a new version of the schedule. You can see it.",
	},
] as const;

function Workflow() {
	return (
		<section className="dk-section dk-container" id="how-it-works">
			<SectionHeading
				eyebrow="How it works"
				title="Set up. Schedule. Send."
				lede="Go from an empty workplace to a published schedule. Then keep the schedule correct during the week."
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
				<h2 id="dk-cap-title">Everything for the schedule.</h2>
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
			<ThemedImage
				name="product-worker-mobile"
				width={780}
				height={1688}
				loading="lazy"
				alt="The jooling worker app. It shows the next shift, a notice of a published schedule, and a shift change to accept"
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
					<h2>Made for managers. Easy for workers.</h2>
					<p className="dk-lede">
						A schedule affects the life of a worker. Give your workers clear
						information so that they can plan.
					</p>
					<ul className="dk-checklist">
						{[
							"The next shift is easy to find",
							"Availability and time off, with no extra work",
							"A clear message when a shift changes",
							"One schedule on the web and on mobile",
						].map((item) => (
							<li key={item}>
								<Check size={14} /> {item}
							</li>
						))}
					</ul>
					<div className="dk-hero-actions">
						<PrimaryCTA />
						<Link className="dk-text-link dk-arrow-link" href="/worker-app">
							See the worker app <ArrowRight size={14} />
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
					<p className="dk-eyebrow">Do you change tools?</p>
					<h2 className="dk-card-title">Bring your next week with you.</h2>
					<p className="dk-lede">
						Put your schedule in a draft. Check it. Publish it when it is
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
					<p className="dk-eyebrow">Do you open a restaurant?</p>
					<h2 className="dk-card-title">
						Make the first schedule before opening day.
					</h2>
					<p className="dk-lede">
						Set up your roles and workers. Start from a weekly template. Publish
						only when the plan is ready. A new restaurant workplace can use
						jooling free for 90 days.
					</p>
					<div className="dk-opening-stat">
						<span className="dk-opening-num">90</span>
						<span>
							days free
							<small>for a new restaurant workplace</small>
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
				eyebrow="Pricing"
				title="One price for each location. All workers included."
				lede="Each plan has all workers. The price is for each location. Move the slider to see your price."
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
				There is no fee for workers. There is no setup fee. Your workers keep access to their
				schedule history.
			</p>
		</section>
	);
}

function Faq() {
	return (
		<section className="dk-section dk-container" id="faq">
			<div className="dk-faq">
				<SectionHeading
					eyebrow="Questions"
					title="Your questions, with answers."
					lede={
						<>
							Find the basic answers here. Find more in the{" "}
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

export function HomePage() {
	return (
		<DarkPage before={<Announcement />}>
			<Hero />
			<Industries />
			<Workflow />
			<Capabilities />
			<Team />
			<Switching />
			<Pricing />
			<Faq />
			<FinalCTA
				badge="Your week, ready"
				title="A clear plan makes a good week."
				body="Make the schedule. Keep your workers informed. Spend your time on other work."
			/>
		</DarkPage>
	);
}
