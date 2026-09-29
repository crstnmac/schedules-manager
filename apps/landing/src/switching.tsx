import { ArrowDown, Check } from "lucide-react";
import type { ReactNode } from "react";
import { captureComparisonSignup } from "./analytics";
import { Link } from "./router";
import {
	appUrl,
	DarkPage,
	FinalCTA,
	PrimaryCTA,
	Reveal,
	SectionHeading,
} from "./site-shell";
import { ThemedImage } from "./theme";

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

export function ComparisonPage({ slug }: { slug: string }) {
	const competitor = competitors.find((item) => item.slug === slug);
	if (!competitor) return null;
	const details = switchingDetails[competitor.slug];
	const signUp = new URL(appUrl);
	signUp.searchParams.set("mode", "sign-up");
	signUp.searchParams.set("switching_from", competitor.slug);
	const onSignUp = () => captureComparisonSignup(competitor.slug);
	const steps = [
		{ title: details.exportStep.title, body: details.exportStep.body },
		{
			title: "Import and match",
			body: "Download jooling's CSV template in the schedule actions menu, or upload your export straight away. The preview shows exactly what will be created and flags names or times that need a fix.",
		},
		{
			title: "Publish when ready",
			body: "Imported shifts land in a draft. Adjust, review conflicts, and publish one clear version — workers are notified, and nothing changes silently.",
		},
	];
	return (
		<DarkPage>
			<section className="dk-container dk-page-hero">
				<div className="dk-page-hero-copy">
					<nav className="dk-subnav" aria-label="Switching guides">
						{competitors.map((item) => (
							<Link
								key={item.slug}
								href={`/vs/${item.slug}`}
								aria-current={item.slug === slug ? "page" : undefined}
							>
								From {item.name}
							</Link>
						))}
					</nav>
					<p className="dk-eyebrow">Switching from {competitor.name}</p>
					<h1>
						A calmer way to run <em>next week.</em>
					</h1>
					<p className="dk-page-lede">{competitor.detail}</p>
					<div className="dk-hero-actions">
						<PrimaryCTA href={signUp.toString()} onClick={onSignUp}>
							Start 30 days free
						</PrimaryCTA>
						<a className="dk-btn dk-btn-ghost" href="#switch-steps">
							See how importing works
							<ArrowDown aria-hidden="true" size={15} />
						</a>
					</div>
				</div>
			</section>
			<section className="dk-container" aria-label="Product preview">
				<div className="dk-shot">
					<ThemedImage
						name="product-schedule"
						width={2940}
						height={1720}
						alt="A jooling manager workspace showing one published week of shifts across the team"
					/>
				</div>
			</section>
			<section id="what-changes" className="dk-container dk-section">
				<SectionHeading
					eyebrow="The difference"
					title="Less chasing. More clarity."
					lede="Keep the parts of scheduling that matter close to hand, from the first draft to the version your team sees."
				/>
				<ul className="dk-point-grid is-two">
					{details.changes.map((change) => (
						<Reveal as="li" className="dk-point" key={change.title}>
							<span className="dk-icon-tile">
								<Check aria-hidden="true" size={16} />
							</span>
							<h3>{change.title}</h3>
							<p>{change.body}</p>
						</Reveal>
					))}
				</ul>
			</section>
			<section id="switch-steps" className="dk-container dk-section">
				<SectionHeading
					eyebrow="The move"
					title="Bring your next week over."
					lede="Take a deliberate path from your existing schedule to a draft you can review before anyone is notified."
				/>
				<ol className="dk-point-grid">
					{steps.map((step, index) => (
						<Reveal as="li" className="dk-point" key={step.title}>
							<span className="dk-step-num" aria-hidden="true">
								{String(index + 1).padStart(2, "0")}
							</span>
							<h3>{step.title}</h3>
							<p>{step.body}</p>
						</Reveal>
					))}
				</ol>
			</section>
			<FinalCTA
				badge="Ready when you are"
				title="Your clearest week yet."
				body="Per-location pricing. Your whole team included. Cancel any time."
				href={signUp.toString()}
				onClick={onSignUp}
			/>
		</DarkPage>
	);
}
