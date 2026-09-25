import { env } from "@SchedulesManager/env/landing";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { captureComparisonSignup } from "./analytics";
import { LandingLink } from "./landing-link";
import { isSet, LEGAL_ENTITY, withPeriod } from "./site-config";
import "./comparison-redesign.css";

export const competitors = [
	{
		slug: "sling",
		name: "Sling",
		hook: {
			title: "One dependable app on both phones",
			line: "Published versions and notifications that arrive — jooling ships the same full-featured app on iPhone and Android.",
		},
		detail:
			"Plan a week, publish a clear version, and handle changes without losing track of what workers were told.",
	},
	{
		slug: "hotschedules",
		name: "HotSchedules",
		hook: {
			title: "Per location, not per person",
			line: "One flat price per location with every worker and manager included — no per-seat add-ons anywhere in jooling.",
		},
		detail:
			"Invite every worker without adding a per-worker charge to your jooling plan.",
	},
	{
		slug: "homebase",
		name: "Homebase",
		hook: {
			title: "Every location, reviewed before it publishes",
			line: "Organize schedules by location and look over the changes before anyone is told.",
		},
		detail:
			"Organize schedules by location and review changes before publishing them to your team.",
	},
	{
		slug: "when-i-work",
		name: "When I Work",
		hook: {
			title: "A workflow that stays put",
			line: "Draft, review, publish, acknowledge — the same clear loop every week, from a team that builds only scheduling.",
		},
		detail:
			"Build a draft, review conflicts, and publish a version your team can acknowledge.",
	},
] as const;

type CompetitorSlug = (typeof competitors)[number]["slug"];

const switchingDetails: Record<
	CompetitorSlug,
	{
		changes: { title: string; body: string }[];
		exportStep: { title: string; body: ReactNode };
	}
> = {
	sling: {
		changes: [
			{
				title: "Draft, then publish",
				body: "Plan the week on a draft, then publish one clear version. Your team is told about the new version — they never discover silent edits.",
			},
			{
				title: "Changes stay visible",
				body: "Every publish shows what changed and which workers acknowledged the new schedule.",
			},
			{
				title: "The same app on every phone",
				body: "jooling is one codebase for iPhone and Android, so neither half of your team gets a second-class app.",
			},
			{
				title: "One price per location",
				body: "Per-location pricing with every worker and manager included — pricing that doesn't punish a growing team.",
			},
		],
		exportStep: {
			title: "Export from Sling",
			body: (
				<>
					Export a week from Sling as CSV and upload it directly in jooling's
					schedule actions menu.{" "}
					<a
						href="https://support.toasttab.com/en/article/Sling-by-Toast-Create-a-Schedule"
						target="_blank"
						rel="noreferrer"
					>
						See Sling's export instructions
					</a>
					.
				</>
			),
		},
	},
	hotschedules: {
		changes: [
			{
				title: "Draft, then publish",
				body: "Plan the week on a draft, then publish one clear version. Your team is told about the new version — they never discover silent edits.",
			},
			{
				title: "Changes stay visible",
				body: "Every publish shows what changed and which workers acknowledged the new schedule.",
			},
			{
				title: "Your workers never pay",
				body: "Every worker gets the full app, free. Nothing comes between your team and their schedule.",
			},
			{
				title: "One price for the whole location",
				body: "One per-location price covers every worker, manager, and schedule you run there.",
			},
		],
		exportStep: {
			title: "Export from HotSchedules",
			body: (
				<>
					Fourth WFM managers can export ShiftTimes from Reporting after
					enabling the export permission; preview the CSV in jooling. Other
					HotSchedules layouts can use our shift template.{" "}
					<a
						href="https://help.hotschedules.com/hc/en-us/articles/21353648812685-November-16th-2023-Release-Note-WFM-UK-Scheduling-Improved-Method-of-Assigning-Shifts-on-Tablet-Devices-Employee-Hours-Worked-and-Shift-Times-Exports-Maximum-Hours-Per-Day-Restrictions"
						target="_blank"
						rel="noreferrer"
					>
						See the illustrated ShiftTimes guide
					</a>
					.
				</>
			),
		},
	},
	homebase: {
		changes: [
			{
				title: "Draft, then publish",
				body: "Plan the week on a draft, then publish one clear version. Your team is told about the new version — they never discover silent edits.",
			},
			{
				title: "Changes stay visible",
				body: "Every publish shows what changed and which workers acknowledged the new schedule.",
			},
			{
				title: "The same app on every phone",
				body: "jooling is one codebase for iPhone and Android, so neither half of your team gets a second-class app.",
			},
			{
				title: "Built to be left",
				body: "One-click cancel and a full CSV export of workers, shifts, and time entries. No lock-in, no support tickets to leave.",
			},
		],
		exportStep: {
			title: "Export from Homebase",
			body: "Export the schedule week from Homebase as CSV and upload it in jooling's schedule import. The preview flags anything that needs attention; if the layout doesn't line up, our CSV template is a two-minute reformat.",
		},
	},
	"when-i-work": {
		changes: [
			{
				title: "Draft, then publish",
				body: "Plan the week on a draft, then publish one clear version. Your team is told about the new version — they never discover silent edits.",
			},
			{
				title: "Changes stay visible",
				body: "Every publish shows what changed and which workers acknowledged the new schedule.",
			},
			{
				title: "Scheduling is the whole product",
				body: "jooling builds schedules, period. The draft, review, publish loop you set up stays your workflow, release after release.",
			},
			{
				title: "One price per location",
				body: "Per-location pricing with every worker and manager included — pricing that doesn't punish a growing team.",
			},
		],
		exportStep: {
			title: "Export from When I Work",
			body: (
				<>
					In When I Work, export the schedule from the Scheduler's day or week
					view, then upload the first sheet of the downloaded XLSX in jooling's
					schedule import.{" "}
					<a
						href="https://help.wheniwork.com/articles/exporting-schedules/"
						target="_blank"
						rel="noreferrer"
					>
						See the illustrated export guide
					</a>
					.
				</>
			),
		},
	},
};

export function SwitchingSection() {
	return (
		<section className="switching-section" id="switching">
			<div className="section-container switching-content">
				<div className="switching-intro">
					<p className="eyebrow">Making a move?</p>
					<h2>Bring your next week with you.</h2>
					<p className="switching-lede">
						Move your schedule into a draft, review it, then publish when it's ready.
					</p>
				</div>
				<nav className="switching-grid" aria-label="Switching guides">
					{competitors.map((competitor) => (
						<LandingLink className="switching-guide" href={`/vs/${competitor.slug}`} key={competitor.slug}>
							<span>From {competitor.name}</span>
								<ArrowRight aria-hidden="true" size={18} />
							</LandingLink>
					))}
				</nav>
			</div>
		</section>
	);
}

export function OpeningRestaurantSection() {
	const appUrl = env.VITE_APP_URL;
	const signUp = new URL(appUrl);
	signUp.searchParams.set("mode", "sign-up");
	signUp.searchParams.set("opening_restaurant", "1");
	return (
		<section className="opening-section" id="opening-restaurant">
			<div className="section-container opening-content">
				<div>
					<p className="eyebrow">Opening a restaurant?</p>
					<h2>Make the first schedule before opening day.</h2>
					<p>
						Set up roles and your team, start from a reusable weekly schedule,
						and publish only when the plan is ready. New restaurant workplaces
						can try jooling for 90 days at their first checkout.
					</p>
				</div>
				<LandingLink className="button button-primary" href={signUp.toString()}>
					Start 90 days free <ArrowRight aria-hidden="true" size={18} />
				</LandingLink>
			</div>
		</section>
	);
}

export function ComparisonPage({ slug }: { slug: string }) {
	const competitor = competitors.find((item) => item.slug === slug);
	if (!competitor) return null;
	const details = switchingDetails[competitor.slug];
	const appUrl = env.VITE_APP_URL;
	const signUp = new URL(appUrl);
	signUp.searchParams.set("mode", "sign-up");
	signUp.searchParams.set("switching_from", competitor.slug);
	const startFree = (
		<>
			Start 30 days free <ArrowRight aria-hidden="true" size={18} />
		</>
	);
	return (
		<div className="comparison-page">
			<LandingLink className="skip-link" href="#main-content">
				Skip to content
			</LandingLink>
			<header className="comparison-header section-container">
				<LandingLink className="brand" href="/" aria-label="jooling home">
					<img src="/logo-mark.svg" alt="" />
					jooling<span className="brand-dot">.</span>
				</LandingLink>
				<nav className="comparison-header-nav" aria-label="Page navigation">
					<a href="#what-changes">Why jooling</a>
					<a href="#switch-steps">Moving your schedule</a>
				</nav>
				<LandingLink
					className="comparison-header-cta"
					href={signUp.toString()}
					onClick={() => captureComparisonSignup(competitor.slug)}
				>
					Start free <ArrowRight aria-hidden="true" size={16} />
				</LandingLink>
			</header>
			<main id="main-content" className="comparison-main">
				<section className="comparison-hero section-container">
					<p className="eyebrow">Switching from {competitor.name}</p>
					<h1>
						A calmer way to run <span>next week.</span>
					</h1>
					<p className="comparison-lede">{competitor.detail}</p>
					<div className="comparison-actions">
						<LandingLink
							className="button button-primary"
							href={signUp.toString()}
							onClick={() => captureComparisonSignup(competitor.slug)}
						>
							{startFree}
						</LandingLink>
						<a className="comparison-quiet" href="#switch-steps">
							See how importing works <ArrowDown aria-hidden="true" size={18} />
						</a>
					</div>
					<figure className="comparison-product">
						<div className="comparison-product-meta">
							<span>Inside jooling</span>
							<span>One schedule. One clear version.</span>
						</div>
						<img
							className="real-schedule-screenshot comparison-shot"
							src="/schedule.webp"
							alt="A jooling manager workspace showing one published week of shifts across the team"
							loading="lazy"
						/>
					</figure>
				</section>
				<section id="what-changes" className="comparison-changes section-container">
					<div className="comparison-section-heading">
						<p className="eyebrow">The difference</p>
						<h2>Less chasing. More clarity.</h2>
						<p>Keep the parts of scheduling that matter close to hand, from the first draft to the version your team sees.</p>
					</div>
					<div className="comparison-changes-grid">
						{details.changes.map((change) => (
							<article key={change.title}>
								<div className="comparison-change-head">
									<Check aria-hidden="true" size={19} />
									<h3>{change.title}</h3>
								</div>
								<p>{change.body}</p>
							</article>
						))}
					</div>
				</section>
				<section
					id="switch-steps"
					className="comparison-steps section-container"
				>
					<div className="comparison-section-heading">
						<p className="eyebrow">The move</p>
						<h2>Bring your next week over.</h2>
						<p>Take a deliberate path from your existing schedule to a draft you can review before anyone is notified.</p>
					</div>
					<ol className="comparison-step-grid">
						<li>
							<span className="comparison-step-num" aria-hidden="true">
								1
							</span>
							<h3>{details.exportStep.title}</h3>
							<p>{details.exportStep.body}</p>
						</li>
						<li>
							<span className="comparison-step-num" aria-hidden="true">
								2
							</span>
							<h3>Import and match</h3>
							<p>
								Download jooling's CSV template in the schedule actions menu, or
								upload your export straight away. The preview shows exactly what
								will be created and flags names or times that need a fix.
							</p>
						</li>
						<li>
							<span className="comparison-step-num" aria-hidden="true">
								3
							</span>
							<h3>Publish when ready</h3>
							<p>
								Imported shifts land in a draft. Adjust, review conflicts, and
								publish one clear version — workers are notified, and nothing
								changes silently.
							</p>
						</li>
					</ol>
				</section>
				<section className="comparison-cta section-container">
					<div>
						<p className="eyebrow">Ready when you are</p>
						<h2>Your clearest week yet.</h2>
						<p>
							Per-location pricing. Your whole team included. Cancel any time.
						</p>
					</div>
					<LandingLink
						className="button button-primary"
						href={signUp.toString()}
						onClick={() => captureComparisonSignup(competitor.slug)}
					>
						{startFree}
					</LandingLink>
				</section>
			</main>
			<footer className="comparison-footer section-container">
				<span>
					© {new Date().getFullYear()}
					{isSet(LEGAL_ENTITY.legalName)
						? ` ${withPeriod(LEGAL_ENTITY.legalName)}`
						: ""}
				</span>
				<LandingLink href="/privacy">Privacy</LandingLink>
				<LandingLink href="/terms">Terms</LandingLink>
				<LandingLink href="/dpa">DPA</LandingLink>
			</footer>
		</div>
	);
}
