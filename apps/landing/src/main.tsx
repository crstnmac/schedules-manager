import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Button,
	buttonVariants,
} from "@SchedulesManager/ui/components/button";
import {
	ScrollArea,
	ScrollBar,
} from "@SchedulesManager/ui/components/scroll-area";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
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
	Coffee,
	HeartPulse,
	LayoutGrid,
	MapPin,
	Menu,
	MessageSquare,
	Plus,
	Send,
	Settings2,
	ShieldCheck,
	ShoppingBag,
	Smartphone,
	Users,
	Utensils,
	X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function LandingLink({
	className,
	variant = "link",
	size = "default",
	...props
}: React.ComponentProps<"a"> & {
	variant?: "default" | "outline" | "secondary" | "ghost" | "link";
	size?: "default" | "xs" | "sm" | "lg";
}) {
	return (
		<a
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}
const appUrl = import.meta.env.VITE_APP_URL || "http://localhost:3001";
const signUpUrl = new URL(appUrl);
signUpUrl.searchParams.set("mode", "sign-up");
const people = [
	{
		name: "Olivia Chen",
		role: "Shift lead",
		initials: "OC",
		color: "blue",
		shifts: [
			"07:00 – 15:00",
			"07:00 – 15:00",
			"",
			"07:00 – 15:00",
			"07:00 – 15:00",
			"",
			"",
		],
	},
	{
		name: "James Wilson",
		role: "Barista",
		initials: "JW",
		color: "teal",
		shifts: [
			"08:00 – 16:00",
			"",
			"08:00 – 16:00",
			"08:00 – 16:00",
			"",
			"08:00 – 16:00",
			"",
		],
	},
	{
		name: "Amara Okafor",
		role: "Barista",
		initials: "AO",
		color: "purple",
		shifts: [
			"",
			"09:00 – 17:00",
			"09:00 – 17:00",
			"",
			"09:00 – 17:00",
			"09:00 – 17:00",
			"",
		],
	},
	{
		name: "Leo Martinez",
		role: "Front of house",
		initials: "LM",
		color: "blue",
		shifts: [
			"10:00 – 18:00",
			"10:00 – 18:00",
			"",
			"10:00 – 18:00",
			"",
			"",
			"10:00 – 18:00",
		],
	},
];
const faqIcons = [Users, Smartphone, Bell, MapPin, CircleDollarSign];
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
		"Every plan starts with 30 days free. You can invite your whole team and use the complete plan before your first charge, then manage or cancel billing at any time.",
	],
];
function Brand() {
	return (
		<LandingLink className="brand" href="#" aria-label="jooling home">
			<img src="/logo-mark.svg" alt="" />
			jooling<span className="brand-dot">.</span>
		</LandingLink>
	);
}
function CTA({ children = "Get started" }: { children?: React.ReactNode }) {
	return (
		<LandingLink
			className="button button-primary"
			href={signUpUrl.toString()}
			variant="default"
			size="lg"
		>
			{children}
			<ArrowUpRight data-icon="inline-end" />
		</LandingLink>
	);
}

const pricingFeatures = {
	schedule: [
		"Weekly schedules and reusable templates",
		"Availability, time off, open shifts, and swaps",
		"Versioned publishing and change history",
		"Team notifications and messaging",
		"Unlimited workers and managers",
	],
	operations: [
		"Everything in Schedule",
		"Time clock, kiosk, and geofencing",
		"Attendance, breaks, and timesheet approval",
		"Labor cost and overtime reporting",
		"Auto-assign and workforce controls",
	],
} as const;

function Pricing() {
	const [annual, setAnnual] = useState(true);
	return (
		<section className="pricing-section" id="pricing">
			<div className="section-container">
				<div className="pricing-heading">
					<div>
						<p className="eyebrow">Simple pricing</p>
						<h2>
							One price for the place.
							<br />
							<span>Everyone included.</span>
						</h2>
					</div>
					<ToggleGroup
						className="billing-toggle"
						aria-label="Billing interval"
						value={[annual ? "annual" : "monthly"]}
						onValueChange={(value) => {
							const interval = value.at(-1);
							if (interval) setAnnual(interval === "annual");
						}}
						spacing={0}
					>
						<ToggleGroupItem value="monthly">
							Monthly
						</ToggleGroupItem>
						<ToggleGroupItem value="annual">
							Annual <small>Save 20%</small>
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
				<div className="pricing-grid">
					{(["schedule", "operations"] as const).map((plan) => {
						const price =
							plan === "schedule" ? (annual ? 31 : 39) : annual ? 63 : 79;
						return (
							<article
								className={`pricing-card pricing-card-${plan}`}
								key={plan}
							>
								<div className="pricing-card-heading">
									<div>
										<p>
											{plan === "schedule"
												? "For clear, dependable scheduling"
												: "For complete workforce operations"}
										</p>
										<h3>{plan === "schedule" ? "Schedule" : "Operations"}</h3>
									</div>
									{plan === "operations" ? <span>Recommended</span> : null}
								</div>
								<div className="pricing-price">
									<strong>${price}</strong>
									<span>
										per location
										<br />
										per month
									</span>
								</div>
								<p className="pricing-billed">
									{annual
										? `Billed annually at $${plan === "schedule" ? 372 : 756} per location.`
										: "Billed monthly. Cancel any time."}
								</p>
								<ul>
									{pricingFeatures[plan].map((feature) => (
										<li key={feature}>
											<Check size={16} />
											{feature}
										</li>
									))}
								</ul>
								<LandingLink
									className={`button ${plan === "operations" ? "button-primary" : "button-secondary"}`}
									href={signUpUrl.toString()}
									variant={plan === "operations" ? "default" : "outline"}
									size="lg"
								>
									Start 30 days free <ArrowUpRight data-icon="inline-end" />
								</LandingLink>
							</article>
						);
					})}
				</div>
				<p className="pricing-note">
					No worker fees. No setup fee. Your team keeps access to its schedule
					history.
				</p>
			</div>
		</section>
	);
}
function SchedulePreview() {
	const [published, setPublished] = useState(false);
	const [week, setWeek] = useState(0);
	const start = new Date(2026, 8, 7 + week * 7);
	const end = new Date(2026, 8, 13 + week * 7);
	return (
		<div className="schedule-frame" id="product-demo">
			<img
				className="real-schedule-screenshot"
				src="/schedule.webp"
				alt="The jooling weekly schedule shown in the real web product"
			/>
			<div className="schedule-app">
				<aside className="demo-sidebar">
					<div className="workspace">
						<span className="workspace-icon">
							<Coffee size={17} />
						</span>
						<strong>Daybreak Café</strong>
						<ChevronDown size={12} />
					</div>
					<div className="sidebar-label">WORKSPACE</div>
					{[
						{ icon: CalendarDays, name: "Schedule" },
						{ icon: Users, name: "Team" },
						{ icon: MessageSquare, name: "Requests" },
						{ icon: Bell, name: "Activity" },
					].map(({ icon: Icon, name }) => (
						<div
							className={`sidebar-item${name === "Schedule" ? " selected" : ""}`}
							key={name}
						>
							<Icon size={15} />
							<span>{name}</span>
							{name === "Requests" && <b>3</b>}
						</div>
					))}
					<div className="sidebar-bottom">
						<span className="avatar teal">AK</span>
						<div>
							<strong>Alex Kim</strong>
							<small>Workplace manager</small>
						</div>
					</div>
				</aside>
				<div className="demo-main">
					<div className="demo-breadcrumb">
						Workspace <ChevronRight size={12} /> <span>Schedule</span>
						<span className="demo-example">Example workspace</span>
					</div>
					<div className="schedule-toolbar">
						<div>
							<h3>Team schedule</h3>
							<p>
								<MapPin size={12} /> Downtown location <ChevronDown size={12} />
							</p>
						</div>
						<Button
							type="button"
							className={`publish-button${published ? " is-published" : ""}`}
							onClick={() => setPublished(!published)}
						>
							{published ? (
								<CheckCheck data-icon="inline-start" />
							) : (
								<Send data-icon="inline-start" />
							)}{" "}
							{published ? "Published" : "Publish schedule"}
						</Button>
					</div>
					<div className="schedule-controls">
						<div>
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label="Previous week"
								onClick={() => {
									setWeek(week - 1);
									setPublished(false);
								}}
							>
								<ChevronLeft />
							</Button>
							<strong>
								{start.toLocaleDateString("en", {
									month: "short",
									day: "numeric",
								})}{" "}
								–{" "}
								{end.toLocaleDateString("en", {
									month: "short",
									day: "numeric",
								})}
								, {end.getFullYear()}
							</strong>
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label="Next week"
								onClick={() => {
									setWeek(week + 1);
									setPublished(false);
								}}
							>
								<ChevronRight />
							</Button>
							<Badge
								variant={published ? "secondary" : "outline"}
								className="draft-label"
							>
								{published ? "Published · v1" : "Draft"}
							</Badge>
						</div>
						<span className="week-label">
							<CalendarDays size={13} /> Week view
						</span>
					</div>
					<ScrollArea
						className="grid-overflow"
						aria-label="Example weekly schedule, scroll to see all days"
					>
						<div className="week-grid">
							<div className="grid-head team-head">
								Team members <span>4</span>
							</div>
							{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
								(day, i) => (
									<div
										key={day}
										className={`grid-head${i === 1 ? " today" : ""}`}
									>
										{day} <b>{new Date(2026, 8, 7 + week * 7 + i).getDate()}</b>
									</div>
								),
							)}
							{people.map((p) => (
								<React.Fragment key={p.name}>
									<div className="person-cell">
										<span className={`avatar ${p.color}`}>{p.initials}</span>
										<div>
											<strong>{p.name}</strong>
											<small>{p.role} · 32h</small>
										</div>
									</div>
									{p.shifts.map((s, i) => (
										<div
											className={`shift-cell${i === 1 ? " today" : ""}`}
											key={p.initials + i}
										>
											{s ? (
												<div className={`shift ${p.color}`}>
													<strong>{s}</strong>
													<span>{p.role}</span>
												</div>
											) : (
												<span className="off-day">—</span>
											)}
										</div>
									))}
								</React.Fragment>
							))}
							<div className="person-cell open-label">
								<span className="open-icon">
									<Plus size={15} />
								</span>
								<strong>Open shifts</strong>
							</div>
							{["", "", "", "12:00 – 18:00", "", "", ""].map((s, i) => (
								<div className="shift-cell" key={"open" + i}>
									{s && (
										<div className="shift amber">
											<strong>{s}</strong>
											<span>Barista · Open</span>
										</div>
									)}
								</div>
							))}
						</div>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
					<div className="schedule-bottom">
						<span>
							<span className="live-dot" /> All changes saved
						</span>
						<span>
							16 assigned shifts <span className="dot-divider">·</span> 1 open
							shift
						</span>
					</div>
				</div>
			</div>
			<div
				className={`publish-toast${published ? " toast-active" : ""}`}
				role="status"
			>
				<span className="toast-icon">
					<Check size={18} />
				</span>
				<div>
					<strong>
						{published
							? "Your example schedule is published"
							: "One schedule. Everyone in sync."}
					</strong>
					<p>
						{published
							? "Preview only — no notifications were sent."
							: "Publish the week. Keep your team in the loop."}
					</p>
				</div>
				<span className="toast-avatars">
					<i>OC</i>
					<i>JW</i>
					<i>AO</i>
				</span>
			</div>
		</div>
	);
}
function App() {
	const [menuOpen, setMenuOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const updateHeader = () => setScrolled(window.scrollY > 12);
		updateHeader();
		window.addEventListener("scroll", updateHeader, { passive: true });
		return () => window.removeEventListener("scroll", updateHeader);
	}, []);

	return (
		<div className="site">
			<LandingLink className="skip-link" href="#main-content">
				Skip to content
			</LandingLink>
			<header className={`header${scrolled ? " is-scrolled" : ""}`}>
				<div className="nav-container">
					<Brand />
					<nav
						id="main-navigation"
						aria-label="Main navigation"
						className={`nav-links${menuOpen ? " open" : ""}`}
					>
						<LandingLink href="#how-it-works" onClick={() => setMenuOpen(false)}>
							How it works
						</LandingLink>
						<LandingLink href="#for-your-team" onClick={() => setMenuOpen(false)}>
							For your team
						</LandingLink>
						<LandingLink href="#pricing" onClick={() => setMenuOpen(false)}>
							Pricing
						</LandingLink>
						<LandingLink href="#faq" onClick={() => setMenuOpen(false)}>
							FAQs
						</LandingLink>
					</nav>
					<div className="nav-actions">
						<LandingLink className="login-link" href={appUrl}>
							Log in <ArrowUpRight size={14} />
						</LandingLink>
						<CTA />
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="menu-toggle"
							aria-label={menuOpen ? "Close navigation" : "Open navigation"}
							aria-expanded={menuOpen}
							aria-controls="main-navigation"
							onClick={() => setMenuOpen(!menuOpen)}
						>
							{menuOpen ? <X /> : <Menu />}
						</Button>
					</div>
				</div>
			</header>
			<main id="main-content">
				<section className="hero">
					<div className="hero-wash" aria-hidden="true" />
					<img
						className="hero-illustration"
						src="/illustration-hero.webp"
						alt=""
						aria-hidden="true"
					/>
					<h1>
						Good weeks
						<br />
						start <span>here.</span>
						<svg
							className="headline-spark"
							viewBox="0 0 44 48"
							aria-hidden="true"
						>
							<path d="M8 29 28 8M17 35l22-6M4 19 7 2" />
						</svg>
					</h1>
					<p className="hero-description">
						Shift scheduling for hourly teams.
						<br />
						Plan shifts, handle changes, and keep everyone in sync.
					</p>
					<div className="hero-actions">
						<CTA>Get started</CTA>
						<LandingLink
							className="button button-secondary"
							href="#product-demo"
							variant="outline"
							size="lg"
						>
							See it in action <ArrowRight size={16} />
						</LandingLink>
					</div>
					<SchedulePreview />
				</section>
				<section className="industries" aria-label="Built for hourly teams">
					<div className="industry-list">
						<span>
							<Coffee /> Cafés & restaurants
						</span>
						<span>
							<ShoppingBag /> Retail
						</span>
						<span>
							<HeartPulse /> Healthcare
						</span>
						<span>
							<Utensils /> Hospitality
						</span>
						<span>
							<Users /> Your team, too
						</span>
					</div>
					<img
						className="industries-illustration"
						loading="lazy"
						decoding="async"
						src="/illustration-industries.webp"
						alt="A connected neighborhood of café, retail, healthcare, hospitality, and field teams"
					/>
				</section>
				<section className="workflow-section" id="how-it-works">
					<div className="section-container workflow-layout">
						<div className="workflow-heading">
							<p className="eyebrow">How it works</p>
							<h2>Set up. Schedule. Send.</h2>
							<p>
								Take the week from an empty workplace to a published schedule.
							</p>
							<img
								className="workflow-illustration"
								loading="lazy"
								decoding="async"
								src="/illustration-workflow.webp"
								alt=""
								aria-hidden="true"
							/>
						</div>
						<ol className="workflow-list">
							<li>
								<div>
									<h3>Set up your workplace.</h3>
									<p>Add each location, role, and teammate.</p>
								</div>
							</li>
							<li>
								<div>
									<h3>Build the schedule.</h3>
									<p>
										Assign shifts around availability and resolve uncovered
										work.
									</p>
								</div>
							</li>
							<li>
								<div>
									<h3>Publish the week.</h3>
									<p>
										Notify the team, track acknowledgements, and keep later
										changes with the schedule.
									</p>
								</div>
							</li>
						</ol>
					</div>
				</section>
				<section className="team-section section-container" id="for-your-team">
					<div className="team-copy">
						<h2>
							Built for managers.
							<br />
							<span>Loved by the team.</span>
						</h2>
						<p>
							The schedule is a big part of someone’s life. Give your people the
							clarity and flexibility to plan around it.
						</p>
						<ul>
							<li>
								<Check /> The next shift, always easy to find
							</li>
							<li>
								<Check /> Availability and time off, without the chase
							</li>
							<li>
								<Check /> Clear updates when something changes
							</li>
							<li>
								<Check /> A shared plan, on web and mobile
							</li>
						</ul>
						<CTA>Get started</CTA>
					</div>
					<div className="phone-scene">
						<img
							className="team-illustration"
							loading="lazy"
							decoding="async"
							src="/illustration-team.webp"
							alt="Four hourly workers reviewing their week together"
						/>
						<span className="scene-note">
							A little more clarity.
							<br />A lot less “just checking…”
							<svg viewBox="0 0 70 50" aria-hidden="true">
								<path d="M5 5Q10 40 60 32m-12-8 13 8-12 9" />
							</svg>
						</span>
						<img
							className="real-mobile-screenshot"
							src="/worker-home-mobile.webp"
							alt="The real jooling worker schedule on mobile"
						/>
						<div className="phone" aria-hidden="true">
							<div className="phone-top">
								<span>9:41</span>
								<span className="phone-island" />
								<span>••• ▰</span>
							</div>
							<div className="phone-greeting">
								<img src="/logo-mark.svg" alt="jooling" />
								<Bell size={18} />
							</div>
							<p>MONDAY, SEPTEMBER 7</p>
							<h3>Hey, Olivia</h3>
							<span className="phone-subtitle">Here’s what’s coming up.</span>
							<div className="next-shift">
								<span>
									NEXT SHIFT <span>Tomorrow</span>
								</span>
								<h4>07:00 – 15:00</h4>
								<p>Shift lead</p>
								<div>
									<MapPin size={13} /> Daybreak Café · Downtown
								</div>
							</div>
							<div className="phone-week">
								<strong>Your week</strong>
								<span>32 hours</span>
							</div>
							<div className="phone-days">
								{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
									<div key={"day" + i} className={i === 1 ? "active" : ""}>
										{d}
										<b>{7 + i}</b>
										<i />
									</div>
								))}
							</div>
							<div className="phone-confirm">
								<span>
									<CheckCheck size={17} />
								</span>
								<div>
									<strong>You’re up to date</strong>
									<small>You’ve seen the latest schedule.</small>
								</div>
							</div>
							<div className="phone-nav">
								<span>
									<CalendarDays />
									Schedule
								</span>
								<span>
									<LayoutGrid />
									Requests
								</span>
								<span>
									<Users />
									Profile
								</span>
							</div>
						</div>
						<div className="phone-floating">
							<ShieldCheck size={20} />
							<span>
								A change of plan?<strong>You’ll be the first to know.</strong>
							</span>
						</div>
					</div>
				</section>
				<Pricing />
				<section className="faq-section" id="faq">
					<div className="faq-intro">
						<p className="eyebrow">Questions, answered</p>
						<h2>Glad you asked.</h2>
						<p>Everything your team needs to get started.</p>
						<img
							className="faq-illustration"
							loading="lazy"
							decoding="async"
							src="/illustration-faq.webp"
							alt=""
							aria-hidden="true"
						/>
					</div>
					<div className="faq-list">
						{faqs.map(([q, a], index) => {
							const Icon = faqIcons[index];
							return (
								<article key={q}>
									<div className="faq-icon" aria-hidden="true">
										<Icon size={22} strokeWidth={1.5} />
									</div>
									<h3>{q}</h3>
									<p>{a}</p>
								</article>
							);
						})}
					</div>
				</section>
			</main>
			<footer className="sky-footer">
				<div className="footer-sky" aria-hidden="true" />
				<div className="footer-callout section-container">
					<span className="footer-kicker">
						<CheckCheck size={15} /> Your week, sorted
					</span>
					<h2>
						Good weeks
						<br />
						start with a clear plan.
					</h2>
					<p>
						Build the schedule, bring your team along, and get back to the work
						that matters.
					</p>
					<CTA>Get started</CTA>
				</div>
				<div className="footer-directory section-container">
					<div className="footer-intro">
						<Brand />
						<p>A calmer way to schedule hourly teams.</p>
					</div>
					<div className="footer-column">
						<strong>Product</strong>
						<LandingLink href="#how-it-works">How it works</LandingLink>
						<LandingLink href="#pricing">Pricing</LandingLink>
						<LandingLink href="#faq">FAQs</LandingLink>
					</div>
					<div className="footer-column">
						<strong>For teams</strong>
						<LandingLink href="#for-your-team">Team experience</LandingLink>
						<LandingLink href={appUrl}>Log in</LandingLink>
						<LandingLink href={signUpUrl.toString()}>Get started</LandingLink>
					</div>
				</div>
				<div className="footer-bottom section-container">
					<span>© {new Date().getFullYear()} jooling</span>
				</div>
				<div
					className="footer-landscape"
					role="img"
					aria-label="A café, shop, clinic, and hotel beginning a calm, well-planned day"
				/>
			</footer>
		</div>
	);
}
createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
