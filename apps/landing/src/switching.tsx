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
			title: "One reliable app on both phones",
			line: "You get published versions and notifications that arrive. jooling has the same full app on iPhone and on Android.",
		},
		detail:
			"Plan a week and publish a clear version. Do changes and always know what you told the workers.",
	},
	{
		slug: "hotschedules",
		name: "HotSchedules",
		hook: {
			title: "Per location, not per person",
			line: "One flat price for each location. All workers and managers are included. jooling has no extra fee for each user.",
		},
		detail:
			"Invite all your workers. Your jooling plan has no charge for each worker.",
	},
	{
		slug: "homebase",
		name: "Homebase",
		hook: {
			title: "Check each location before you publish",
			line: "Keep a schedule for each location. Check the changes before you tell anyone.",
		},
		detail:
			"Keep a schedule for each location. Check the changes before you publish them to your workers.",
	},
	{
		slug: "when-i-work",
		name: "When I Work",
		hook: {
			title: "A workflow that does not change",
			line: "Draft, check, publish, acknowledge. This is the same clear loop each week. Our team makes only scheduling software.",
		},
		detail:
			"Make a draft and check the conflicts. Then publish a version that your workers can acknowledge.",
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
				body: "Plan the week in a draft. Then publish one clear version. Your workers get a message about the new version. No edit is hidden.",
			},
			{
				title: "Changes stay visible",
				body: "Each publish shows what changed. It also shows which workers acknowledged the new schedule.",
			},
			{
				title: "The same app on each phone",
				body: "jooling uses one codebase for iPhone and Android. All your workers get the same quality of app.",
			},
			{
				title: "One price for each location",
				body: "The price is for each location. All workers and managers are included. The price does not increase when your team grows.",
			},
		],
		exportStep: {
			title: "Export from Sling",
			body: (
				<>
					Export a week from Sling as CSV. Upload it in the schedule actions menu
					in jooling.{" "}
					<a
						href="https://support.toasttab.com/en/article/Sling-by-Toast-Create-a-Schedule"
						target="_blank"
						rel="noreferrer"
					>
						See the Sling export instructions
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
				body: "Plan the week in a draft. Then publish one clear version. Your workers get a message about the new version. No edit is hidden.",
			},
			{
				title: "Changes stay visible",
				body: "Each publish shows what changed. It also shows which workers acknowledged the new schedule.",
			},
			{
				title: "Your workers do not pay",
				body: "Each worker gets the full app free. Nothing prevents a worker from seeing the schedule.",
			},
			{
				title: "One price for the whole location",
				body: "One price for each location covers all workers, managers, and schedules there.",
			},
		],
		exportStep: {
			title: "Export from HotSchedules",
			body: (
				<>
					Fourth WFM managers can export ShiftTimes from Reporting. First, enable the export permission. Then show the CSV in the jooling preview. For other
					HotSchedules layouts, use our shift template.{" "}
					<a
						href="https://help.hotschedules.com/hc/en-us/articles/21353648812685-November-16th-2023-Release-Note-WFM-UK-Scheduling-Improved-Method-of-Assigning-Shifts-on-Tablet-Devices-Employee-Hours-Worked-and-Shift-Times-Exports-Maximum-Hours-Per-Day-Restrictions"
						target="_blank"
						rel="noreferrer"
					>
						See the ShiftTimes guide with pictures
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
				body: "Plan the week in a draft. Then publish one clear version. Your workers get a message about the new version. No edit is hidden.",
			},
			{
				title: "Changes stay visible",
				body: "Each publish shows what changed. It also shows which workers acknowledged the new schedule.",
			},
			{
				title: "The same app on each phone",
				body: "jooling uses one codebase for iPhone and Android. All your workers get the same quality of app.",
			},
			{
				title: "Easy to leave",
				body: "You can cancel in one click. You can export all workers, shifts, and time entries as CSV. There is no lock-in. You do not need a support ticket.",
			},
		],
		exportStep: {
			title: "Export from Homebase",
			body: "Export the schedule week from Homebase as CSV. Upload it in the jooling schedule import. The preview shows items that need attention. If the layout does not match, use our CSV template. It takes about two minutes.",
		},
	},
	"when-i-work": {
		changes: [
			{
				title: "Draft, then publish",
				body: "Plan the week in a draft. Then publish one clear version. Your workers get a message about the new version. No edit is hidden.",
			},
			{
				title: "Changes stay visible",
				body: "Each publish shows what changed. It also shows which workers acknowledged the new schedule.",
			},
			{
				title: "Scheduling is the whole product",
				body: "jooling makes schedules and nothing else. The draft, check, publish loop stays the same in each release.",
			},
			{
				title: "One price for each location",
				body: "The price is for each location. All workers and managers are included. The price does not increase when your team grows.",
			},
		],
		exportStep: {
			title: "Export from When I Work",
			body: (
				<>
					In When I Work, export the schedule from the Scheduler day view or
					week view. Then upload the first sheet of the XLSX file in the jooling
					schedule import.{" "}
					<a
						href="https://help.wheniwork.com/articles/exporting-schedules/"
						target="_blank"
						rel="noreferrer"
					>
						See the export guide with pictures
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
			body: "Download the jooling CSV template from the schedule actions menu. Or upload your export immediately. The preview shows what jooling will create. It shows names and times that you must correct.",
		},
		{
			title: "Publish when ready",
			body: "Imported shifts go into a draft. Change them and check the conflicts. Then publish one clear version. Workers get a message. No change is hidden.",
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
						A simple way to run <em>next week.</em>
					</h1>
					<p className="dk-page-lede">{competitor.detail}</p>
					<div className="dk-hero-actions">
						<PrimaryCTA href={signUp.toString()} onClick={onSignUp}>
							Start 30 days free
						</PrimaryCTA>
						<a className="dk-btn dk-btn-ghost" href="#switch-steps">
							See how to import
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
						alt="A jooling manager workspace. It shows one published week of shifts for the workers"
					/>
				</div>
			</section>
			<section id="what-changes" className="dk-container dk-section">
				<SectionHeading
					eyebrow="The difference"
					title="Less work. More clarity."
					lede="Keep the important parts of scheduling near you. This is true from the first draft to the version that your workers see."
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
					title="Bring your next week to jooling."
					lede="Go from your current schedule to a draft. You can check the draft before you tell anyone."
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
				title="Your clearest week."
				body="The price is for each location. All your workers are included. Cancel at any time."
				href={signUp.toString()}
				onClick={onSignUp}
			/>
		</DarkPage>
	);
}
