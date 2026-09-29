import { env } from "@SchedulesManager/env/landing";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { Check } from "lucide-react";
import { Link } from "./router";
import { DarkPage, FinalCTA, PrimaryCTA, Reveal } from "./site-shell";

const appUrl = env.VITE_APP_URL;
const signUp = new URL(appUrl);
signUp.searchParams.set("mode", "sign-up");
const restaurantSignUp = new URL(signUp);
restaurantSignUp.searchParams.set("opening_restaurant", "1");

export const solutions = {
	restaurant: {
		eyebrow: "Restaurant scheduling software",
		title: "Publish restaurant shifts with a plan for every change.",
		lede: "Build a clear rota for front of house and kitchen teams, publish it when it is ready, and keep everyone informed as the week changes.",
		image: "/product-schedule.png",
		imageAlt:
			"jooling weekly schedule with shifts assigned across a restaurant team",
		points: [
			[
				"Build the week around your service",
				"Set up locations and roles, reuse a weekly schedule, and assign shifts around your team's availability.",
			],
			[
				"Publish with confidence",
				"Share the finished schedule with the team. Workers can see their next shift on web or mobile, and managers can track acknowledgements.",
			],
			[
				"Handle the inevitable change",
				"Manage time off, open shifts, and swaps in the same place. Publish updates so affected teammates know what changed.",
			],
		],
		closing:
			"Opening a new restaurant? Set up your first schedule before opening day. New restaurant workplaces can opt into a 90-day trial at their first checkout.",
		cta: "Start your restaurant trial",
		signUp: restaurantSignUp.toString(),
	},
	retail: {
		eyebrow: "Retail scheduling software",
		title: "Keep store shifts clear, even when the week moves.",
		lede: "Plan coverage by role and location, publish one schedule your team can check, and make changes without losing track of the latest plan.",
		image: "/product-schedule.png",
		imageAlt:
			"jooling weekly schedule with shifts by person and role across a location",
		points: [
			[
				"See the coverage you need",
				"Build weekly schedules for each location and role, with availability and time off visible as you plan.",
			],
			[
				"Give everyone the current schedule",
				"Publish the week and notify your team. Store associates can check their shifts from the web or mobile app.",
			],
			[
				"Fill gaps as they happen",
				"Use open shifts and swaps to handle changes, then publish the updated schedule and track acknowledgements.",
			],
		],
		closing:
			"Bring every store and teammate into one scheduling workflow. Pricing is per location, with unlimited workers and managers.",
		cta: "Start 30 days free",
		signUp: signUp.toString(),
	},
	"worker-app": {
		eyebrow: "Employee scheduling app",
		title: "A worker app that keeps the next shift in view.",
		lede: "Give your team a simple place to see their schedule, share availability, request time off, and stay up to date when shifts change.",
		image: "/product-worker-mobile.png",
		imageAlt: "jooling worker app showing the next shift and weekly schedule",
		points: [
			[
				"Know what is coming up",
				"Workers can check their next shift and weekly schedule on mobile or the web.",
			],
			[
				"Make requests without the chase",
				"Teammates can submit availability and time off, and respond to open shifts and swap requests.",
			],
			[
				"Stay in sync when plans change",
				"Affected teammates receive schedule updates. Managers can see acknowledgements and ask for acceptance of important late changes.",
			],
		],
		closing:
			"The worker app is part of jooling's scheduling plans. Invite your whole team without adding a per-worker fee.",
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
							<img
								src={page.image}
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
						<img
							src={page.image}
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
					<h2 id="solution-details-title">A clearer week for everyone.</h2>
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
				title="Ready to make the next week easier?"
				body={page.closing}
				cta={page.cta}
				href={page.signUp}
			/>
		</DarkPage>
	);
}
