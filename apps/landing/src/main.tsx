import { MotionRoot } from "@SchedulesManager/ui/components/motion";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { captureComparisonVisit } from "./analytics";
import { CookieConsent } from "./cookie-consent";
import { DpaPage } from "./dpa";
import { HomePage } from "./home";
import { AccountDeletionPage, PrivacyPolicyPage, TermsPage } from "./legal";
import { usePathname } from "./router";
import { SolutionPage, type SolutionSlug, solutions } from "./solutions";
import { ComparisonPage, competitors } from "./switching";
import "./styles.css";

const siteUrl = "https://jooling.com";
const defaultDescription =
	"Scheduling software for hourly teams. Make and publish shifts. Do changes. Keep everyone informed. Start your 30-day free trial.";
const routeSeo: Record<string, { title: string; description: string }> = {
	"/": {
		title: "Employee Scheduling Software for Hourly Teams | jooling",
		description: defaultDescription,
	},
	"/privacy": {
		title: "Privacy Policy — jooling",
		description:
			"Learn how jooling collects, uses, shares, and protects information when you use its scheduling products and services.",
	},
	"/account-deletion": {
		title: "Account Deletion — jooling",
		description:
			"Request deletion of your jooling account and learn what data is deleted or retained.",
	},
	"/terms": {
		title: "Terms & Conditions — jooling",
		description:
			"Read the terms and conditions that govern access to and use of jooling's scheduling products and services.",
	},
	"/dpa": {
		title: "Data Processing Addendum — jooling",
		description:
			"How jooling processes workplace data on behalf of business customers: roles, subprocessors, security, and transfer safeguards.",
	},
	"/restaurant": {
		title: "Restaurant Scheduling Software | jooling",
		description:
			"Publish restaurant shifts. Manage swaps and time off. Keep front of house and kitchen workers informed.",
	},
	"/retail": {
		title: "Retail Scheduling Software | jooling",
		description:
			"Plan store coverage. Publish retail shifts. Do schedule changes at all locations.",
	},
	"/worker-app": {
		title: "Employee Scheduling App for Workers | jooling",
		description:
			"Give workers one app to see shifts, send availability, ask for time off, and learn about schedule changes.",
	},
	...Object.fromEntries(
		competitors.map((competitor) => [
			`/vs/${competitor.slug}`,
			{
				title: `jooling — ${competitor.name} alternative for shift scheduling`,
				description: `Use jooling instead of ${competitor.name}. Plan, publish, and manage worker schedules. The price is clear and is for each location.`,
			},
		]),
	),
};

function setMeta(selector: string, value: string) {
	const element = document.head.querySelector<HTMLMetaElement>(selector);
	if (element) element.content = value;
}

function App() {
	const pathname = usePathname();

	useEffect(() => {
		const seo = routeSeo[pathname] ?? routeSeo["/"];
		if (
			pathname.startsWith("/vs/") &&
			competitors.some((competitor) => `/vs/${competitor.slug}` === pathname)
		)
			captureComparisonVisit(pathname.slice(4));
		const canonicalUrl = `${siteUrl}${pathname === "/" ? "/" : pathname}`;

		document.title = seo.title;
		setMeta('meta[name="description"]', seo.description);
		setMeta('meta[property="og:title"]', seo.title);
		setMeta('meta[property="og:description"]', seo.description);
		setMeta('meta[property="og:url"]', canonicalUrl);
		setMeta('meta[name="twitter:title"]', seo.title);
		setMeta('meta[name="twitter:description"]', seo.description);
		document
			.querySelector<HTMLLinkElement>('link[rel="canonical"]')
			?.setAttribute("href", canonicalUrl);
	}, [pathname]);

	if (pathname === "/privacy") return <PrivacyPolicyPage />;
	if (pathname === "/account-deletion") return <AccountDeletionPage />;
	if (pathname === "/terms") return <TermsPage />;
	if (pathname === "/dpa") return <DpaPage />;
	if (pathname.slice(1) in solutions)
		return <SolutionPage slug={pathname.slice(1) as SolutionSlug} />;
	if (pathname.startsWith("/vs/")) {
		const slug = pathname.slice(4);
		return competitors.some((competitor) => competitor.slug === slug) ? (
			<ComparisonPage slug={slug} />
		) : (
			<HomePage />
		);
	}
	return <HomePage />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
	<React.StrictMode>
		<MotionRoot>
			<App />
			<CookieConsent />
		</MotionRoot>
	</React.StrictMode>,
);
