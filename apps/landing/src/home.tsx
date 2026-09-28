import { env } from "@SchedulesManager/env/landing";
import { AnimatedNumber, motion } from "@SchedulesManager/ui/components/motion";
import { fadeUp, staggerContainer } from "@SchedulesManager/ui/lib/motion";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	ArrowRight,
	ArrowUpRight,
	Bell,
	CalendarDays,
	Check,
	CheckCheck,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	CircleDollarSign,
	Clock,
	Coffee,
	FileClock,
	HeartPulse,
	Layers,
	MapPin,
	Menu,
	MessageSquare,
	Plus,
	Repeat,
	Send,
	ShoppingBag,
	Smartphone,
	Users,
	Utensils,
	X,
} from "lucide-react";
import React, { useEffect, useId, useRef, useState } from "react";
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

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const people = [
	{
		name: "Olivia Chen",
		role: "Shift lead",
		initials: "OC",
		hours: 32,
		shifts: ["07:00–15:00", "07:00–15:00", "", "07:00–15:00", "07:00–15:00"],
	},
	{
		name: "James Wilson",
		role: "Barista",
		initials: "JW",
		hours: 32,
		shifts: [
			"08:00–16:00",
			"",
			"08:00–16:00",
			"08:00–16:00",
			"",
			"08:00–16:00",
		],
	},
	{
		name: "Amara Okafor",
		role: "Barista",
		initials: "AO",
		hours: 32,
		shifts: [
			"",
			"09:00–17:00",
			"09:00–17:00",
			"",
			"09:00–17:00",
			"09:00–17:00",
		],
	},
	{
		name: "Leo Martinez",
		role: "Front of house",
		initials: "LM",
		hours: 32,
		shifts: [
			"10:00–18:00",
			"10:00–18:00",
			"",
			"10:00–18:00",
			"",
			"",
			"10:00–18:00",
		],
	},
];

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
	as?: "div" | "header";
	id?: string;
}) {
	const Component = as === "header" ? motion.header : motion.div;
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

function ScheduleMockup() {
	const [published, setPublished] = useState(false);
	const [week, setWeek] = useState(0);
	const start = new Date(2026, 8, 7 + week * 7);
	const end = new Date(2026, 8, 13 + week * 7);
	const fmt = (date: Date) =>
		date.toLocaleDateString("en", { month: "short", day: "numeric" });
	const shiftWeek = (delta: number) => {
		setWeek((w) => w + delta);
		setPublished(false);
	};

	return (
		<div className="dk-mockup" id="product-demo">
			<div className="dk-mockup-tabs" aria-hidden="true">
				<span className="dk-mockup-dots">
					<i />
					<i />
					<i />
				</span>
				<span className="is-active">
					<CalendarDays size={12} /> Schedule
				</span>
				<span>
					<Users size={12} /> Team
				</span>
				<span>
					<MessageSquare size={12} /> Requests <b>3</b>
				</span>
				<span className="dk-mockup-example">Example workspace</span>
			</div>
			<div className="dk-mockup-body">
				<aside className="dk-mockup-side" aria-hidden="true">
					<div className="dk-workspace">
						<span>
							<Coffee size={13} />
						</span>
						<strong>Daybreak Café</strong>
						<ChevronDown size={12} />
					</div>
					<p className="dk-side-label">Workspace</p>
					{[
						{ icon: CalendarDays, name: "Schedule", active: true },
						{ icon: Users, name: "Team" },
						{ icon: MessageSquare, name: "Requests", count: 3 },
						{ icon: Bell, name: "Activity" },
						{ icon: Clock, name: "Time clock" },
					].map(({ icon: Icon, name, active, count }) => (
						<div
							className={cn("dk-side-item", active && "is-active")}
							key={name}
						>
							<Icon size={13} />
							<span>{name}</span>
							{count ? <b>{count}</b> : null}
						</div>
					))}
				</aside>
				<div className="dk-mockup-main">
					<div className="dk-mockup-toolbar">
						<div>
							<h3>Team schedule</h3>
							<p>
								<MapPin size={11} /> Downtown · Europe/Lisbon
							</p>
						</div>
						<div className="dk-mockup-toolbar-actions">
							<div className="dk-week-nav">
								<button
									type="button"
									aria-label="Previous week"
									onClick={() => shiftWeek(-1)}
								>
									<ChevronLeft size={13} />
								</button>
								<strong>
									{fmt(start)} – {fmt(end)}
								</strong>
								<button
									type="button"
									aria-label="Next week"
									onClick={() => shiftWeek(1)}
								>
									<ChevronRight size={13} />
								</button>
							</div>
							<span
								className={cn("dk-badge", published ? "is-live" : "is-draft")}
							>
								<i />
								{published ? "Published · v1" : "Draft"}
							</span>
							<button
								type="button"
								className={cn("dk-publish", published && "is-published")}
								onClick={() => setPublished(!published)}
								aria-pressed={published}
							>
								{published ? <CheckCheck size={13} /> : <Send size={13} />}
								{published ? "Published" : "Publish"}
							</button>
						</div>
					</div>
					<section
						className="dk-grid-scroll"
						aria-label="Example weekly schedule, scroll to see all days"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard reachable
						tabIndex={0}
					>
						<div className="dk-grid">
							<div className="dk-grid-head dk-grid-team">
								Team <span>4</span>
							</div>
							{days.map((day, i) => (
								<div
									key={day}
									className={cn("dk-grid-head", i === 1 && "is-today")}
								>
									{day}
									<b>{new Date(2026, 8, 7 + week * 7 + i).getDate()}</b>
								</div>
							))}
							{people.map((person) => (
								<React.Fragment key={person.name}>
									<div className="dk-grid-person">
										<span className="dk-avatar">{person.initials}</span>
										<div>
											<strong>{person.name}</strong>
											<small>
												{person.role} · {person.hours}h
											</small>
										</div>
									</div>
									{days.map((day, i) => (
										<div
											className={cn("dk-grid-cell", i === 1 && "is-today")}
											key={`${person.initials}-${day}`}
										>
											{person.shifts[i] ? (
												<div className="dk-shift">
													<strong>{person.shifts[i]}</strong>
													<span>{person.role}</span>
												</div>
											) : null}
										</div>
									))}
								</React.Fragment>
							))}
							<div className="dk-grid-person dk-grid-open">
								<span className="dk-avatar dk-avatar-open">
									<Plus size={12} />
								</span>
								<strong>Open shifts</strong>
							</div>
							{days.map((day, i) => (
								<div
									className={cn("dk-grid-cell", i === 1 && "is-today")}
									key={`open-${day}`}
								>
									{i === 3 ? (
										<div className="dk-shift is-open">
											<strong>12:00–18:00</strong>
											<span>Barista · Open</span>
										</div>
									) : null}
								</div>
							))}
						</div>
					</section>
					<div className="dk-mockup-status">
						<span>
							<i className="dk-dot" /> All changes saved
						</span>
						<span>16 assigned · 1 open</span>
					</div>
				</div>
				<aside className="dk-mockup-activity" aria-live="polite">
					<p className="dk-side-label">Activity</p>
					{published ? (
						<>
							<ActivityRow
								initials="OC"
								name="Olivia Chen"
								text="acknowledged v1"
								status="Seen"
							/>
							<ActivityRow
								initials="JW"
								name="James Wilson"
								text="acknowledged v1"
								status="Seen"
							/>
							<ActivityRow
								initials="AO"
								name="Amara Okafor"
								text="notified"
								status="Sent"
								pending
							/>
							<p className="dk-activity-note">
								Preview only — no notifications were sent.
							</p>
						</>
					) : (
						<>
							<ActivityRow
								initials="LM"
								name="Leo Martinez"
								text="requested time off · Sat"
								status="New"
								pending
							/>
							<ActivityRow
								initials="AO"
								name="Amara Okafor"
								text="updated availability"
								status="New"
								pending
							/>
							<p className="dk-activity-note">
								Publish the week to notify the team.
							</p>
						</>
					)}
				</aside>
			</div>
		</div>
	);
}

function ActivityRow({
	initials,
	name,
	text,
	status,
	pending,
}: {
	initials: string;
	name: string;
	text: string;
	status: string;
	pending?: boolean;
}) {
	return (
		<div className="dk-activity-row">
			<span className="dk-avatar">{initials}</span>
			<div>
				<strong>{name}</strong>
				<small>{text}</small>
			</div>
			<span className={cn("dk-badge", pending ? "is-info" : "is-live")}>
				<i />
				{status}
			</span>
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
				<ScheduleMockup />
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

function WorkflowPanel({ id }: { id: (typeof workflowSteps)[number]["id"] }) {
	if (id === "setup") {
		return (
			<div className="dk-panel-table">
				<div className="dk-table-head">
					<span>Location</span>
					<span>Roles</span>
					<span>Team</span>
					<span>Time zone</span>
				</div>
				{[
					["Downtown", "Barista, Shift lead", "12", "Europe/Lisbon"],
					["Riverside", "Barista, Kitchen", "9", "Europe/Lisbon"],
					["Airport", "Front of house", "15", "Europe/Madrid"],
				].map(([name, roles, team, tz]) => (
					<div className="dk-table-row" key={name}>
						<span className="dk-table-name">
							<i>
								<MapPin size={11} />
							</i>
							{name}
						</span>
						<span>{roles}</span>
						<span className="dk-num">{team}</span>
						<span>{tz}</span>
					</div>
				))}
				<div className="dk-table-add">
					<Plus size={12} /> Add location
				</div>
			</div>
		);
	}
	if (id === "build") {
		return (
			<div className="dk-panel-build">
				{people.slice(0, 3).map((person) => (
					<div className="dk-build-row" key={person.name}>
						<span className="dk-avatar">{person.initials}</span>
						<strong>{person.name}</strong>
						<div className="dk-build-days">
							{days.slice(0, 5).map((day, i) => (
								<span
									key={day}
									className={cn(
										person.shifts[i] ? "is-assigned" : "is-free",
										person.name === "James Wilson" && i === 4 && "is-unavail",
									)}
								>
									{day[0]}
								</span>
							))}
						</div>
					</div>
				))}
				<div className="dk-build-alert">
					<span className="dk-badge is-warn">
						<i />1 uncovered
					</span>
					Thu 12:00–18:00 · Barista — 2 teammates available
				</div>
			</div>
		);
	}
	if (id === "publish") {
		return (
			<div className="dk-flow">
				{[
					{
						icon: FileClock,
						title: "Draft",
						text: "Week of Sep 7",
						tone: "blue",
					},
					{ icon: Check, title: "Review", text: "0 conflicts", tone: "blue" },
					{
						icon: Send,
						title: "Publish v1",
						text: "4 teammates",
						tone: "green",
					},
					{ icon: Bell, title: "Notify", text: "Push + email", tone: "green" },
				].map(({ icon: Icon, title, text, tone }, index) => (
					<React.Fragment key={title}>
						{index > 0 ? <span className="dk-flow-line" /> : null}
						<div className="dk-node">
							<span className={cn("dk-node-icon", `is-${tone}`)}>
								<Icon size={13} />
							</span>
							<strong>{title}</strong>
							<small>{text}</small>
						</div>
					</React.Fragment>
				))}
			</div>
		);
	}
	return (
		<div className="dk-panel-table">
			<div className="dk-table-head dk-table-head-changes">
				<span>Change</span>
				<span>Version</span>
				<span>Status</span>
			</div>
			{[
				["Olivia · Thu 07:00 → 09:00", "v2", "Accepted", "live"],
				["Open shift Thu picked up by James", "v2", "Seen", "live"],
				["Leo · Sat time off approved", "v3", "Pending", "info"],
			].map(([change, version, status, tone]) => (
				<div className="dk-table-row dk-table-row-changes" key={change}>
					<span className="dk-table-name">{change}</span>
					<span className="dk-num">{version}</span>
					<span>
						<span className={cn("dk-badge", `is-${tone}`)}>
							<i />
							{status}
						</span>
					</span>
				</div>
			))}
		</div>
	);
}

function Workflow() {
	const [active, setActive] = useState(0);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const baseId = useId();

	const onKeyDown = (event: React.KeyboardEvent) => {
		const last = workflowSteps.length - 1;
		let next: number | null = null;
		if (event.key === "ArrowDown" || event.key === "ArrowRight")
			next = active === last ? 0 : active + 1;
		if (event.key === "ArrowUp" || event.key === "ArrowLeft")
			next = active === 0 ? last : active - 1;
		if (event.key === "Home") next = 0;
		if (event.key === "End") next = last;
		if (next === null) return;
		event.preventDefault();
		setActive(next);
		tabRefs.current[next]?.focus();
	};

	const step = workflowSteps[active];

	return (
		<section className="dk-section dk-container" id="how-it-works">
			<SectionHeading
				eyebrow="How it works"
				title="Set up. Schedule. Send."
				lede="Take the week from an empty workplace to a published schedule — and keep it right as the week moves."
			/>
			<Reveal className="dk-tabbed">
				<div
					className="dk-tablist"
					role="tablist"
					aria-orientation="vertical"
					aria-label="Workflow steps"
				>
					{workflowSteps.map(({ id, icon: Icon, title, body }, index) => (
						<button
							key={id}
							ref={(el) => {
								tabRefs.current[index] = el;
							}}
							type="button"
							role="tab"
							id={`${baseId}-tab-${id}`}
							aria-selected={index === active}
							aria-controls={`${baseId}-panel`}
							tabIndex={index === active ? 0 : -1}
							className={cn("dk-tab", index === active && "is-active")}
							onClick={() => setActive(index)}
							onKeyDown={onKeyDown}
						>
							<span className="dk-tab-index">0{index + 1}</span>
							<span className="dk-tab-copy">
								<strong>
									<Icon size={14} /> {title}
								</strong>
								<small>{body}</small>
							</span>
						</button>
					))}
				</div>
				<div
					className="dk-tabpanel"
					role="tabpanel"
					id={`${baseId}-panel`}
					aria-labelledby={`${baseId}-tab-${step.id}`}
				>
					<div className="dk-tabpanel-bar" aria-hidden="true">
						<span className="dk-mockup-dots">
							<i />
							<i />
							<i />
						</span>
						<span>{step.title}</span>
					</div>
					<motion.div
						key={step.id}
						className="dk-tabpanel-body"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25 }}
					>
						<WorkflowPanel id={step.id} />
					</motion.div>
				</div>
			</Reveal>
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
		<div className="dk-phone" aria-hidden="true">
			<div className="dk-phone-top">
				<span>9:41</span>
				<span className="dk-phone-island" />
				<span>100%</span>
			</div>
			<div className="dk-phone-greeting">
				<img src="/logo-mark.svg" alt="" />
				<Bell size={15} />
			</div>
			<p className="dk-phone-date">Monday, September 7</p>
			<h3>Hey, Olivia</h3>
			<div className="dk-phone-card">
				<div className="dk-phone-card-head">
					<span>Next shift</span>
					<span className="dk-badge is-info">
						<i />
						Tomorrow
					</span>
				</div>
				<strong>07:00 – 15:00</strong>
				<small>Shift lead</small>
				<p>
					<MapPin size={11} /> Daybreak Café · Downtown
				</p>
			</div>
			<div className="dk-phone-week">
				<span>Your week</span>
				<span>32 hours</span>
			</div>
			<div className="dk-phone-days">
				{days.map((day, i) => (
					<div key={day} className={cn(i === 1 && "is-active")}>
						{day[0]}
						<b>{7 + i}</b>
						<i className={cn(people[0].shifts[i] && "has-shift")} />
					</div>
				))}
			</div>
			<div className="dk-phone-confirm">
				<CheckCheck size={14} />
				<div>
					<strong>You’re up to date</strong>
					<small>You’ve seen the latest schedule.</small>
				</div>
			</div>
			<div className="dk-phone-nav">
				<span className="is-active">
					<CalendarDays size={14} />
					Schedule
				</span>
				<span>
					<Repeat size={14} />
					Requests
				</span>
				<span>
					<Users size={14} />
					Profile
				</span>
			</div>
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
					<div className="dk-float-note">
						<span className="dk-node-icon is-blue">
							<Smartphone size={13} />
						</span>
						<div>
							<strong>Schedule updated</strong>
							<small>Thu 07:00 → 09:00 · tap to accept</small>
						</div>
					</div>
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
