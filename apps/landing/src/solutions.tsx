import { env } from "@SchedulesManager/env/landing";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { Check } from "lucide-react";
import { Link } from "./router";
import { DarkPage, FinalCTA, PrimaryCTA, Reveal } from "./site-shell";
import { ThemedImage } from "./theme";

const appUrl = env.VITE_APP_URL;
const signUp = new URL(appUrl);
signUp.searchParams.set("mode", "sign-up");
const restaurantSignUp = new URL(signUp);
restaurantSignUp.searchParams.set("opening_restaurant", "1");

export const solutions = {
	restaurant: {
		eyebrow: "Restaurant scheduling software",
		title: "Publish restaurant shifts. Plan for each change.",
		lede: "Make a clear schedule for front of house and kitchen workers. Publish it when it is ready. Keep everyone informed when the week changes.",
		image: "product-schedule",
		imageAlt:
			"jooling weekly schedule with shifts assigned to restaurant workers",
		points: [
			[
				"Make the week to match your service",
				"Set up your locations and roles. Use a weekly template again. Assign shifts to match the availability of your workers.",
			],
			[
				"Publish with confidence",
				"Send the finished schedule to your workers. Workers can see their next shift on the web or on mobile. Managers can see who acknowledged.",
			],
			[
				"Prepare for each change",
				"Manage time off, open shifts, and swaps in one place. Publish an update. The workers it affects then know what changed.",
			],
		],
		closing:
			"Do you open a new restaurant? Make your first schedule before opening day. A new restaurant workplace can get a 90-day trial at the first checkout.",
		cta: "Start your restaurant trial",
		signUp: restaurantSignUp.toString(),
	},
	retail: {
		eyebrow: "Retail scheduling software",
		title: "Keep store shifts clear when the week changes.",
		lede: "Plan coverage for each role and location. Publish one schedule that your workers can see. Make changes and always know which plan is the latest.",
		image: "product-schedule",
		imageAlt:
			"jooling weekly schedule with shifts for each worker and role at a location",
		points: [
			[
				"See the coverage you need",
				"Make a weekly schedule for each location and role. See availability and time off when you plan.",
			],
			[
				"Give everyone the current schedule",
				"Publish the week and tell your workers. Store workers can see their shifts on the web or in the mobile app.",
			],
			[
				"Fill gaps when they occur",
				"Use open shifts and swaps to do changes. Then publish the new schedule and see who acknowledged.",
			],
		],
		closing:
			"Put each store and each worker in one scheduling workflow. The price is for each location. There is no limit on workers and managers.",
		cta: "Start 30 days free",
		signUp: signUp.toString(),
	},
	"worker-app": {
		eyebrow: "Employee scheduling app",
		title: "A worker app that shows the next shift.",
		lede: "Give your workers one simple place to see their schedule, send their availability, ask for time off, and learn about shift changes.",
		image: "product-worker-mobile",
		imageAlt: "jooling worker app. It shows the next shift and the weekly schedule",
		points: [
			[
				"Know the next shift",
				"Workers can see their next shift and their weekly schedule on mobile or on the web.",
			],
			[
				"Send requests with no extra work",
				"Workers can send availability and time-off requests. They can also answer open shifts and swap requests.",
			],
			[
				"Stay informed when plans change",
				"Workers get schedule updates that affect them. Managers can see acknowledgements. For an important late change, managers can ask the worker to accept it.",
			],
		],
		closing:
			"The worker app is in all jooling scheduling plans. Invite all your workers. There is no fee for each worker.",
		cta: "Get started",
		signUp: signUp.toString(),
	},
} as const;

export type SolutionSlug = keyof typeof solutions;

const solutionLinks: [SolutionSlug, string][] = [
	["restaurant", "Restaurants"],
	["retail", "Retail"],
	["worker-app", "Worker app"],
];

export function SolutionPage({ slug }: { slug: SolutionSlug }) {
	const page = solutions[slug];
	const isPhone = slug === "worker-app";
	return (
		<DarkPage>
			<section
				className={cn("dk-container dk-page-hero", isPhone && "has-phone")}
			>
				<div className="dk-page-hero-copy">
					<nav className="dk-subnav" aria-label="Solutions">
						{solutionLinks.map(([key, label]) => (
							<Link
								key={key}
								href={`/${key}`}
								aria-current={key === slug ? "page" : undefined}
							>
								{label}
							</Link>
						))}
					</nav>
					<p className="dk-eyebrow">{page.eyebrow}</p>
					<h1>{page.title}</h1>
					<p className="dk-page-lede">{page.lede}</p>
					<div className="dk-hero-actions">
						<PrimaryCTA href={page.signUp}>{page.cta}</PrimaryCTA>
						<Link className="dk-btn dk-btn-ghost" href="/#pricing">
							See pricing
						</Link>
					</div>
				</div>
				{isPhone ? (
					<div className="dk-page-phone">
						<div className="dk-phone">
							<ThemedImage
								name={page.image}
								alt={page.imageAlt}
								width={780}
								height={1688}
							/>
						</div>
					</div>
				) : null}
			</section>
			{isPhone ? null : (
				<section className="dk-container" aria-label="Product preview">
					<div className="dk-shot">
						<ThemedImage
							name={page.image}
							alt={page.imageAlt}
							width={2940}
							height={1720}
						/>
					</div>
				</section>
			)}
			<section
				className="dk-container dk-section"
				aria-labelledby="solution-details-title"
			>
				<Reveal as="header" className="dk-section-heading">
					<p className="dk-eyebrow">How jooling helps</p>
					<h2 id="solution-details-title">A clear week for everyone.</h2>
				</Reveal>
				<ul className="dk-point-grid">
					{page.points.map(([title, description]) => (
						<Reveal as="li" className="dk-point" key={title}>
							<span className="dk-icon-tile">
								<Check aria-hidden="true" size={16} />
							</span>
							<h3>{title}</h3>
							<p>{description}</p>
						</Reveal>
					))}
				</ul>
			</section>
			<FinalCTA
				title="Make next week easier."
				body={page.closing}
				cta={page.cta}
				href={page.signUp}
			/>
		</DarkPage>
	);
}
