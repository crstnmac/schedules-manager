import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type React from "react";
import { LandingLink } from "./landing-link";
import { Link } from "./router";

const appUrl = import.meta.env.VITE_APP_URL || "http://localhost:3001";
const signUpUrl = new URL(appUrl);
signUpUrl.searchParams.set("mode", "sign-up");

const LAST_UPDATED = "September 11, 2026";

function LegalBrand() {
	return (
		<Link className="brand" to="/" aria-label="jooling home">
			<img src="/logo-mark.svg" alt="" />
			jooling<span className="brand-dot">.</span>
		</Link>
	);
}

function LegalHeader() {
	return (
		<header className="header is-scrolled">
			<div className="nav-container">
				<LegalBrand />
				<div className="nav-actions legal-nav-actions">
					<LandingLink className="legal-back" href="/">
						<ArrowLeft size={14} />
						Back to home
					</LandingLink>
					<LandingLink
						className="button button-primary legal-login"
						href={appUrl}
						variant="default"
						size="lg"
					>
						Log in <ArrowUpRight data-icon="inline-end" />
					</LandingLink>
				</div>
			</div>
		</header>
	);
}

function LegalFooter() {
	return (
		<footer className="legal-footer">
			<div className="section-container legal-footer-inner">
				<span>© {new Date().getFullYear()} jooling. All rights reserved.</span>
				<nav aria-label="Legal">
					<Link to="/privacy">Privacy Policy</Link>
					<Link to="/terms">Terms &amp; Conditions</Link>
					<LandingLink href={signUpUrl.toString()}>Get started</LandingLink>
				</nav>
			</div>
		</footer>
	);
}

type LegalSection = {
	id: string;
	heading: string;
	body: React.ReactNode;
};

function LegalLayout({
	eyebrow,
	title,
	intro,
	sections,
}: {
	eyebrow: string;
	title: string;
	intro: React.ReactNode;
	sections: LegalSection[];
}) {
	return (
		<div className="site legal-site">
			<a className="skip-link" href="#legal-content">
				Skip to content
			</a>
			<LegalHeader />
			<main id="legal-content" className="legal-main">
				<div className="section-container legal-container">
					<header className="legal-header">
						<p className="eyebrow">{eyebrow}</p>
						<h1>{title}</h1>
						<p className="legal-updated">Last updated {LAST_UPDATED}</p>
						<div className="legal-intro">{intro}</div>
					</header>
					<article className="legal-body">
						{sections.map((section) => (
							<section key={section.id} id={section.id}>
								<h2>{section.heading}</h2>
								{section.body}
							</section>
						))}
					</article>
				</div>
			</main>
			<LegalFooter />
		</div>
	);
}

export function PrivacyPolicyPage() {
	return (
		<LegalLayout
			eyebrow="Privacy Policy"
			title="Your data, handled with care."
			intro={
				<p>
					This Privacy Policy explains how jooling ("jooling", "we", "us", or
					"our") collects, uses, shares, and protects information when you use
					our scheduling products and services for hourly teams (the "Service").
					It applies to workplace owners, managers, workers, and anyone who
					visits our website or apps.
				</p>
			}
			sections={[
				{
					id: "information-we-collect",
					heading: "1. Information we collect",
					body: (
						<>
							<p>
								We collect information you give us, information created as you
								use the Service, and some technical information automatically.
							</p>
							<ul>
								<li>
									<strong>Account and profile details</strong>, such as name,
									email address, phone number, password, profile photo, job
									title, and the workplace and locations you belong to.
								</li>
								<li>
									<strong>Workplace and scheduling data</strong>, such as
									locations, positions, schedules, shifts, availability,
									time-off requests, shift swaps, time entries, attendance
									marks, tasks, and messages exchanged within a workplace.
								</li>
								<li>
									<strong>Billing information</strong>, such as plan, billing
									contact, and payment status. Card details are handled by our
									payment processor and are not stored on our servers.
								</li>
								<li>
									<strong>Device and usage information</strong>, such as IP
									address, browser and app type, device identifiers, operating
									system, pages viewed, and timestamps.
								</li>
								<li>
									<strong>Location information</strong>, where you enable
									location features such as geofenced time entries. You can turn
									this off in your device settings, though some features will
									stop working.
								</li>
							</ul>
						</>
					),
				},
				{
					id: "how-we-use-information",
					heading: "2. How we use information",
					body: (
						<>
							<p>We use the information we collect to:</p>
							<ul>
								<li>provide, operate, and maintain the Service;</li>
								<li>
									create and manage accounts, workplaces, schedules, and
									time-related records;
								</li>
								<li>
									send notifications about schedules, schedule changes,
									requests, and service updates;
								</li>
								<li>process payments and manage subscriptions;</li>
								<li>
									provide customer support, respond to inquiries, and resolve
									disputes;
								</li>
								<li>
									monitor, secure, and improve the Service, including
									troubleshooting and preventing misuse;
								</li>
								<li>
									comply with legal obligations and enforce our agreements.
								</li>
							</ul>
						</>
					),
				},
				{
					id: "legal-bases",
					heading: "3. Legal bases for processing",
					body: (
						<>
							<p>
								Where applicable law requires a legal basis, we process personal
								information to perform our contract with you, to pursue our
								legitimate interests in running and improving the Service, to
								comply with legal duties, and with your consent where consent is
								required (for example, for optional location features or
								marketing).
							</p>
						</>
					),
				},
				{
					id: "sharing",
					heading: "4. When we share information",
					body: (
						<>
							<p>
								We do not sell your personal information. We share it only as
								needed to run the Service:
							</p>
							<ul>
								<li>
									<strong>Within your workplace.</strong> Managers and
									authorized members can see schedule and work information for
									the locations they manage. Workers can generally see
									workplace-wide schedules and their own records.
								</li>
								<li>
									<strong>Service providers.</strong> Vendors that help us with
									hosting, email and push delivery, payments, analytics, and
									support, under contracts that limit their use of your data.
								</li>
								<li>
									<strong>Legal and safety.</strong> When required by law or to
									protect the rights, safety, and security of jooling, our
									users, or the public.
								</li>
								<li>
									<strong>Business changes.</strong> In connection with a
									merger, acquisition, financing, or sale of assets, with
									appropriate confidentiality protections.
								</li>
							</ul>
						</>
					),
				},
				{
					id: "retention",
					heading: "5. Data retention",
					body: (
						<p>
							We keep personal information for as long as needed to provide the
							Service and for the purposes described in this policy, unless a
							longer period is required or permitted by law. When a workplace
							closes its account or asks us to delete data, we delete or
							anonymize it within a reasonable period, except where we must
							retain records for legal, tax, or security reasons.
						</p>
					),
				},
				{
					id: "security",
					heading: "6. How we protect information",
					body: (
						<p>
							We use administrative, technical, and physical safeguards designed
							to protect personal information, including encryption in transit,
							access controls, and monitoring. No method of transmission or
							storage is completely secure, so we cannot guarantee absolute
							security. Please use a strong, unique password and keep your
							account credentials confidential.
						</p>
					),
				},
				{
					id: "international-transfers",
					heading: "7. International transfers",
					body: (
						<p>
							We may process and store information in countries other than the
							one where you live. Where required, we put appropriate safeguards
							in place for these transfers, such as standard contractual clauses
							or equivalent measures.
						</p>
					),
				},
				{
					id: "your-rights",
					heading: "8. Your rights and choices",
					body: (
						<>
							<p>
								Depending on where you live, you may have the right to access,
								correct, delete, or receive a copy of your personal information,
								to object to or restrict certain processing, and to withdraw
								consent. You can manage much of your information directly in the
								Service, or contact us to make a request. We will not
								discriminate against you for exercising these rights.
							</p>
							<p>
								Workplace members should direct requests about work records to
								their employer first, since the employer controls much of that
								data. We support employers in responding to valid requests.
							</p>
						</>
					),
				},
				{
					id: "cookies",
					heading: "9. Cookies and similar technologies",
					body: (
						<p>
							We use cookies and similar technologies to keep you signed in,
							remember preferences, measure how the Service is used, and improve
							it. You can control cookies through your browser settings.
							Blocking some cookies may affect how the Service works.
						</p>
					),
				},
				{
					id: "children",
					heading: "10. Children's privacy",
					body: (
						<p>
							The Service is intended for use by workplaces and their workers,
							not by children. We do not knowingly collect personal information
							from children under the age required for valid consent in their
							jurisdiction. If you believe a child has provided us information,
							please contact us and we will take appropriate steps.
						</p>
					),
				},
				{
					id: "changes",
					heading: "11. Changes to this policy",
					body: (
						<p>
							We may update this Privacy Policy from time to time. When we make
							material changes, we will update the date above and, where
							appropriate, notify you in the Service or by email. Your continued
							use of the Service after an update means you accept the revised
							policy.
						</p>
					),
				},
				{
					id: "contact",
					heading: "12. Contact us",
					body: (
						<p>
							Questions or requests about privacy can be sent to{" "}
							<a href="mailto:privacy@jooling.com">privacy@jooling.com</a>. We
							will respond as required by applicable law.
						</p>
					),
				},
			]}
		/>
	);
}

export function TermsPage() {
	return (
		<LegalLayout
			eyebrow="Terms & Conditions"
			title="The ground rules."
			intro={
				<p>
					These Terms &amp; Conditions ("Terms") govern your access to and use
					of the jooling websites, apps, and services for hourly teams (the
					"Service"). By creating an account, accessing, or using the Service,
					you agree to these Terms. If you use the Service on behalf of a
					workplace, you represent that you have authority to bind that
					workplace.
				</p>
			}
			sections={[
				{
					id: "accounts",
					heading: "1. Accounts and eligibility",
					body: (
						<>
							<p>
								You must be old enough to enter into a binding contract in your
								jurisdiction to use the Service. You are responsible for the
								accuracy of the information you provide and for keeping your
								credentials secure.
							</p>
							<p>
								If you create or manage a workplace account, you are responsible
								for the users you invite, the permissions you grant, and
								ensuring your use of the Service complies with applicable
								employment and data protection laws.
							</p>
						</>
					),
				},
				{
					id: "the-service",
					heading: "2. The Service",
					body: (
						<>
							<p>
								jooling helps workplaces plan and communicate schedules, manage
								availability and time-off requests, track time, and coordinate
								teams. Features may change over time, and some features may be
								limited by your subscription plan.
							</p>
							<p>
								Subject to these Terms, we grant you a limited, non-exclusive,
								non-transferable, revocable right to use the Service for your
								internal business purposes during your subscription.
							</p>
						</>
					),
				},
				{
					id: "responsibilities",
					heading: "3. Workplace and worker responsibilities",
					body: (
						<>
							<p>
								Workplaces control the scheduling data, worker records, and
								messages within their account. They are responsible for the
								lawful collection and use of that information and for
								communicating schedules and changes to their teams.
							</p>
							<p>
								Workers are responsible for keeping their own availability, time
								entries, and account information accurate, and for using the
								Service respectfully.
							</p>
						</>
					),
				},
				{
					id: "billing",
					heading: "4. Plans, billing, and free trial",
					body: (
						<>
							<p>
								Paid plans are billed per location on a monthly or annual basis,
								as selected at checkout. Fees are stated before you subscribe
								and may change with notice.
							</p>
							<ul>
								<li>
									New workplaces may receive a 30-day free trial. At the end of
									the trial, your selected plan begins unless you cancel before
									it ends.
								</li>
								<li>
									Subscriptions renew automatically until cancelled. You can
									cancel at any time from your billing settings.
								</li>
								<li>
									Except where required by law, fees are non-refundable and
									partially used periods are not refunded.
								</li>
								<li>
									You are responsible for any taxes and for keeping your billing
									information current.
								</li>
							</ul>
						</>
					),
				},
				{
					id: "acceptable-use",
					heading: "5. Acceptable use",
					body: (
						<>
							<p>You agree not to:</p>
							<ul>
								<li>
									use the Service in violation of any law or the rights of
									others;
								</li>
								<li>
									reverse engineer, scrape, resell, or attempt to gain
									unauthorized access to the Service;
								</li>
								<li>
									upload malicious code or interfere with the Service's
									operation or security;
								</li>
								<li>
									send spam or unlawful, harassing, or deceptive content through
									the Service; or
								</li>
								<li>
									use the Service to build a competing product or to access data
									you are not authorized to see.
								</li>
							</ul>
						</>
					),
				},
				{
					id: "intellectual-property",
					heading: "6. Intellectual property and content",
					body: (
						<>
							<p>
								The Service, including its software, design, and trademarks, is
								owned by jooling and its licensors and is protected by
								intellectual property laws. These Terms do not grant you any
								ownership of the Service.
							</p>
							<p>
								You retain ownership of the content you submit, such as
								schedules, messages, and records. You grant us the rights needed
								to host, process, and display that content to operate the
								Service, and as described in our Privacy Policy.
							</p>
						</>
					),
				},
				{
					id: "third-party",
					heading: "7. Third-party services",
					body: (
						<p>
							The Service may integrate with third-party products, such as
							calendar, messaging, payments, or point-of-sale providers. Those
							services are governed by their own terms and policies, and we are
							not responsible for them.
						</p>
					),
				},
				{
					id: "disclaimers",
					heading: "8. Disclaimers",
					body: (
						<p>
							The Service is provided "as is" and "as available". To the maximum
							extent permitted by law, we disclaim all warranties, express or
							implied, including merchantability, fitness for a particular
							purpose, and non-infringement. We do not warrant that the Service
							will be uninterrupted, error-free, or that it will meet your
							specific compliance requirements. jooling is a scheduling tool and
							does not provide legal, payroll, tax, or employment advice.
						</p>
					),
				},
				{
					id: "liability",
					heading: "9. Limitation of liability",
					body: (
						<p>
							To the maximum extent permitted by law, jooling will not be liable
							for indirect, incidental, special, consequential, or punitive
							damages, or for lost profits, revenue, data, or goodwill. Our
							total liability for any claim relating to the Service will not
							exceed the greater of the amounts you paid us in the twelve months
							before the claim or one hundred US dollars. Some jurisdictions do
							not allow certain limitations, so parts of this section may not
							apply to you.
						</p>
					),
				},
				{
					id: "indemnity",
					heading: "10. Indemnification",
					body: (
						<p>
							You agree to defend, indemnify, and hold harmless jooling from
							claims, damages, liabilities, and expenses arising from your use
							of the Service, your content, or your violation of these Terms or
							applicable law.
						</p>
					),
				},
				{
					id: "termination",
					heading: "11. Suspension and termination",
					body: (
						<p>
							We may suspend or terminate access to the Service if you violate
							these Terms or use the Service in a way that creates risk or legal
							exposure. You may stop using the Service at any time and may
							cancel your subscription from your billing settings. Sections that
							by their nature should survive termination, such as intellectual
							property, disclaimers, liability, and indemnity, will survive.
						</p>
					),
				},
				{
					id: "governing-law",
					heading: "12. Governing law and disputes",
					body: (
						<p>
							These Terms are governed by the laws of the jurisdiction in which
							jooling is established, without regard to conflict of law rules.
							Before filing a formal claim, you agree to try to resolve any
							dispute informally by contacting us. Nothing in these Terms limits
							rights you may have under mandatory local law.
						</p>
					),
				},
				{
					id: "changes",
					heading: "13. Changes to these Terms",
					body: (
						<p>
							We may update these Terms from time to time. When we make material
							changes, we will update the date above and, where appropriate,
							notify you in the Service or by email. Your continued use of the
							Service after an update means you accept the revised Terms.
						</p>
					),
				},
				{
					id: "contact",
					heading: "14. Contact us",
					body: (
						<p>
							Questions about these Terms can be sent to{" "}
							<a href="mailto:legal@jooling.com">legal@jooling.com</a>. For
							product help, reach us at{" "}
							<a href="mailto:support@jooling.com">support@jooling.com</a>.
						</p>
					),
				},
			]}
		/>
	);
}
