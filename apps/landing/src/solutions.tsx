import { env } from "@SchedulesManager/env/landing";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { LandingLink } from "./landing-link";

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
		image: "/schedule.webp",
		imageAlt: "jooling weekly schedule with shifts assigned across a team",
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
		image: "/illustration-industries.webp",
		imageAlt: "Illustration of a shop and other hourly workplaces",
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
		image: "/worker-home-mobile.webp",
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

export function SolutionPage({ slug }: { slug: SolutionSlug }) {
	const page = solutions[slug];
	return (
		<div className="solution-page">
			<LandingLink className="skip-link" href="#main-content">
				Skip to content
			</LandingLink>
			<header className="solution-header section-container">
				<LandingLink className="brand" href="/" aria-label="jooling home">
					<img src="/logo-mark.svg" alt="" />
					jooling<span className="brand-dot">.</span>
				</LandingLink>
				<LandingLink className="button button-primary" href={page.signUp}>
					{page.cta}
					<ArrowRight aria-hidden="true" size={17} />
				</LandingLink>
			</header>
			<main id="main-content">
				<section className="solution-hero section-container">
					<LandingLink className="solution-back" href="/">
						<ChevronLeft aria-hidden="true" size={17} /> Back to jooling
					</LandingLink>
					<p className="eyebrow">{page.eyebrow}</p>
					<h1>{page.title}</h1>
					<p className="solution-lede">{page.lede}</p>
					<LandingLink className="button button-primary" href={page.signUp}>
						{page.cta}
						<ArrowRight aria-hidden="true" size={17} />
					</LandingLink>
				</section>
				<section
					className={`solution-visual section-container${slug === "worker-app" ? "solution-visual-phone" : ""}`}
					aria-label="Product preview"
				>
					<img src={page.image} alt={page.imageAlt} decoding="async" />
				</section>
				<section
					className="solution-details section-container"
					aria-labelledby="solution-details-title"
				>
					<p className="eyebrow">How jooling helps</p>
					<h2 id="solution-details-title">A clearer week for everyone.</h2>
					<div className="solution-grid">
						{page.points.map(([title, description]) => (
							<Card key={title}>
								<CardHeader>
									<Check aria-hidden="true" size={22} />
									<CardTitle>
										<h3>{title}</h3>
									</CardTitle>
									<CardDescription>{description}</CardDescription>
								</CardHeader>
							</Card>
						))}
					</div>
				</section>
				<section className="solution-cta">
					<div className="section-container">
						<h2>Ready to make the next week easier?</h2>
						<p>{page.closing}</p>
						<LandingLink className="button button-primary" href={page.signUp}>
							{page.cta}
							<ArrowRight aria-hidden="true" size={17} />
						</LandingLink>
					</div>
				</section>
			</main>
			<footer className="solution-footer section-container">
				<span>© {new Date().getFullYear()} jooling</span>
				<nav aria-label="Footer">
					<LandingLink href="/">Home</LandingLink>
					<LandingLink
						href="/restaurant"
						aria-current={slug === "restaurant" ? "page" : undefined}
					>
						Restaurants
					</LandingLink>
					<LandingLink
						href="/retail"
						aria-current={slug === "retail" ? "page" : undefined}
					>
						Retail
					</LandingLink>
					<LandingLink
						href="/worker-app"
						aria-current={slug === "worker-app" ? "page" : undefined}
					>
						Worker app
					</LandingLink>
					<LandingLink href="/privacy">Privacy</LandingLink>
					<LandingLink href="/terms">Terms</LandingLink>
				</nav>
			</footer>
		</div>
	);
}
