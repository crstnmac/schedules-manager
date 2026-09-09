import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	ArrowRight,
	ArrowUpRight,
	CalendarDays,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
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
	Users,
	Utensils,
	X,
	Bell,
	CheckCheck,
} from "lucide-react";
import "./styles.css";
function Badge({
	className,
	variant: _variant,
	...props
}: React.ComponentProps<"span"> & { variant?: string }) {
	return <span className={className} {...props} />;
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
const faqs = [
	[
		"Who is jooling for?",
		"jooling is built for hourly teams in hospitality, retail, healthcare, and beyond. Managers plan and publish schedules, while team members stay on top of their shifts and requests.",
	],
	[
		"Can my team access their schedules on mobile?",
		"Yes. Workers and managers can access schedules on web and through the mobile app. Workers can view upcoming shifts, submit availability, and respond to schedule changes.",
	],
	[
		"What happens when a published schedule changes?",
		"Each published update creates a new schedule version. Affected workers receive explicit notifications, and material late changes can require their acceptance. You can see who has acknowledged an update.",
	],
	[
		"Can I manage more than one location?",
		"Yes. You can organize your workplace into locations, define positions, and give managers access to the teams and schedules they are responsible for.",
	],
];
function Brand() {
	return (
		<a className="brand" href="#" aria-label="jooling home">
			<img src="/logo-mark.svg" alt="" />
			jooling<span className="brand-dot">.</span>
		</a>
	);
}
function CTA({ children = "Get started" }: { children?: React.ReactNode }) {
	return (
		<a className="button button-primary" href={signUpUrl.toString()}>
			{children}
			<ArrowUpRight data-icon="inline-end" />
		</a>
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
							className={
								"sidebar-item " + (name === "Schedule" ? "selected" : "")
							}
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
						<button
							className={"publish-button " + (published ? "is-published" : "")}
							onClick={() => setPublished(!published)}
						>
							{published ? <CheckCheck size={14} /> : <Send size={14} />}{" "}
							{published ? "Published" : "Publish schedule"}
						</button>
					</div>
					<div className="schedule-controls">
						<div>
							<button
								aria-label="Previous week"
								onClick={() => {
									setWeek(week - 1);
									setPublished(false);
								}}
							>
								<ChevronLeft size={15} />
							</button>
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
							<button
								aria-label="Next week"
								onClick={() => {
									setWeek(week + 1);
									setPublished(false);
								}}
							>
								<ChevronRight size={15} />
							</button>
							<Badge variant={published ? "secondary" : "outline"} className="draft-label">
								{published ? "Published · v1" : "Draft"}
							</Badge>
						</div>
						<span className="week-label">
							<CalendarDays size={13} /> Week view
						</span>
					</div>
					<div
						className="grid-overflow"
						tabIndex={0}
						role="region"
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
										className={"grid-head " + (i === 1 ? "today" : "")}
									>
										{day} <b>{new Date(2026, 8, 7 + week * 7 + i).getDate()}</b>
									</div>
								),
							)}
							{people.map((p) => (
								<React.Fragment key={p.name}>
									<div className="person-cell">
										<span className={"avatar " + p.color}>{p.initials}</span>
										<div>
											<strong>{p.name}</strong>
											<small>{p.role} · 32h</small>
										</div>
									</div>
									{p.shifts.map((s, i) => (
										<div
											className={"shift-cell " + (i === 1 ? "today" : "")}
											key={p.initials + i}
										>
											{s ? (
												<div className={"shift " + p.color}>
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
					</div>
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
				className={"publish-toast " + (published ? "toast-active" : "")}
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
			<a className="skip-link" href="#main-content">
				Skip to content
			</a>
			<header className={`header${scrolled ? " is-scrolled" : ""}`}>
				<div className="nav-container">
					<Brand />
					<nav
						aria-label="Main navigation"
						className={"nav-links " + (menuOpen ? "open" : "")}
					>
						<a href="#how-it-works" onClick={() => setMenuOpen(false)}>
							How it works
						</a>
						<a href="#for-your-team" onClick={() => setMenuOpen(false)}>
							For your team
						</a>
						<a href="#faq" onClick={() => setMenuOpen(false)}>
							FAQs
						</a>
					</nav>
					<div className="nav-actions">
						<a className="login-link" href={appUrl}>
							Log in <ArrowUpRight size={14} />
						</a>
						<CTA />
						<button
							className="menu-toggle"
							aria-label={menuOpen ? "Close navigation" : "Open navigation"}
							aria-expanded={menuOpen}
							onClick={() => setMenuOpen(!menuOpen)}
						>
							{menuOpen ? <X /> : <Menu />}
						</button>
					</div>
				</div>
			</header>
			<main id="main-content">
				<section className="hero">
					<div className="hero-wash" aria-hidden="true" />
					<img className="hero-illustration" src="/illustration-hero.webp" alt="" aria-hidden="true" />
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
						A calmer way to schedule your team.
						<br />
						Plan shifts, handle changes, and keep everyone in sync.
					</p>
					<div className="hero-actions">
						<CTA>Start your next chapter</CTA>
						<a className="button button-secondary" href="#product-demo">
							See it in action <ArrowRight size={16} />
						</a>
					</div>
					<p className="hero-note">
						Less back-and-forth. More getting on with your day.
					</p>
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
					<img className="industries-illustration" src="/illustration-industries.webp" alt="A connected neighborhood of café, retail, healthcare, hospitality, and field teams" />
				</section>
				<section className="workflow-section" id="how-it-works">
					<div className="section-container workflow-layout">
						<div className="workflow-heading">
							<p className="eyebrow">How it works</p>
							<h2>Set up. Schedule. Send.</h2>
							<p>Take the week from an empty workplace to a published schedule.</p>
							<img className="workflow-illustration" src="/illustration-workflow.webp" alt="" aria-hidden="true" />
						</div>
						<ol className="workflow-list">
							<li>
								<span className="workflow-index">01</span>
								<div><h3>Set up your workplace.</h3><p>Add each location, role, and teammate.</p></div>
								<span className="workflow-meta">Locations · roles · people</span>
							</li>
							<li>
								<span className="workflow-index">02</span>
								<div><h3>Build the schedule.</h3><p>Assign shifts around availability and resolve uncovered work.</p></div>
								<span className="workflow-meta">Availability · coverage · open shifts</span>
							</li>
							<li>
								<span className="workflow-index">03</span>
								<div><h3>Publish the week.</h3><p>Notify the team, track acknowledgements, and keep later changes with the schedule.</p></div>
								<span className="workflow-meta">Notifications · acknowledgements · updates</span>
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
						<CTA>Bring your team together</CTA>
					</div>
					<div className="phone-scene">
						<img className="team-illustration" src="/illustration-team.webp" alt="Four hourly workers reviewing their week together" />
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
				<section className="faq-section" id="faq">
					<div className="faq-intro">
						<p className="eyebrow">Questions, answered</p>
						<h2>Glad you asked.</h2>
						<p>Everything your team needs to get started.</p>
						<img className="faq-illustration" src="/illustration-faq.webp" alt="" aria-hidden="true" />
					</div>
					<div className="faq-list">
						{faqs.map(([q, a], index) => (
							<article key={q}>
								<span>{String(index + 1).padStart(2, "0")}</span>
								<h3>{q}</h3>
								<p>{a}</p>
							</article>
						))}
					</div>
				</section>
			</main>
			<footer className="sky-footer">
				<div className="footer-sky" aria-hidden="true" />
				<div className="footer-callout section-container">
					<span className="footer-kicker"><CheckCheck size={15} /> Your week, sorted</span>
					<h2>Good weeks<br />start with a clear plan.</h2>
					<p>Build the schedule, bring your team along, and get back to the work that matters.</p>
					<CTA>Plan your first week</CTA>
				</div>
				<div className="footer-directory section-container">
					<div className="footer-intro">
						<Brand />
						<p>A calmer way to schedule hourly teams.</p>
					</div>
					<div className="footer-column">
						<strong>Product</strong>
						<a href="#how-it-works">How it works</a>
						<a href="#faq">FAQs</a>
					</div>
					<div className="footer-column">
						<strong>For teams</strong>
						<a href="#for-your-team">Team experience</a>
						<a href={appUrl}>Log in</a>
						<a href={signUpUrl.toString()}>Get started</a>
					</div>
				</div>
				<div className="footer-bottom section-container">
					<span className="footer-status"><i /> All systems ready</span>
					<span>© {new Date().getFullYear()} jooling</span>
					<a href={signUpUrl.toString()}>Start planning <ArrowRight size={13} /></a>
				</div>
				<div className="footer-landscape" role="img" aria-label="A café, shop, clinic, and hotel beginning a calm, well-planned day" />
			</footer>
		</div>
	);
}
createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
