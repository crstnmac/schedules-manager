import { env } from "@SchedulesManager/env/landing";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type React from "react";
import { LandingLink } from "./landing-link";
import { Link } from "./router";
import "./legal-redesign.css";
import {
	ENTITY_DEFINITION,
	entityLine,
	isSet,
	LAST_UPDATED,
	LEGAL_ENTITY,
	LEGAL_NAME,
	RETENTION,
	registrationSuffix,
	SUBPROCESSORS,
	withPeriod,
} from "./site-config";

const appUrl = env.VITE_APP_URL;
const signUpUrl = new URL(appUrl);
signUpUrl.searchParams.set("mode", "sign-up");

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

export function LegalFooter() {
	const entity = entityLine([
		LEGAL_ENTITY.legalName,
		LEGAL_ENTITY.address,
		isSet(LEGAL_ENTITY.registrationNumber) &&
			`Reg. ${LEGAL_ENTITY.registrationNumber}`,
	]);
	return (
		<footer className="legal-footer">
			<div className="section-container legal-footer-inner">
				<div className="legal-footer-entity">
					<span>
						© {new Date().getFullYear()}
						{isSet(LEGAL_ENTITY.legalName)
							? ` ${withPeriod(LEGAL_ENTITY.legalName)}`
							: "."}{" "}
						All rights reserved.
					</span>
					{entity ? <span>{entity}</span> : null}
				</div>
				<nav aria-label="Legal">
					<Link to="/privacy">Privacy Policy</Link>
					<Link to="/terms">Terms &amp; Conditions</Link>
					<Link to="/dpa">DPA</Link>
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

export function LegalLayout({
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
					<nav className="legal-document-nav" aria-label="Legal documents">
						<Link to="/privacy" aria-current={eyebrow === "Privacy Policy" ? "page" : undefined}>Privacy</Link>
						<Link to="/terms" aria-current={eyebrow === "Terms & Conditions" ? "page" : undefined}>Terms</Link>
						<Link to="/dpa" aria-current={eyebrow === "Data Processing Addendum" ? "page" : undefined}>Data processing</Link>
					</nav>
					<header className="legal-header">
						<div className="legal-header-meta"><p className="eyebrow">Legal / {eyebrow}</p><p className="legal-updated">Last updated {LAST_UPDATED}</p></div>
						<h1>{title}</h1>
						<div className="legal-intro">{intro}</div>
					</header>
					<div className="legal-document-grid">
						<aside className="legal-contents" aria-label="On this page">
							<p>On this page</p>
							<nav>
								{sections.map((section) => (
									<a key={section.id} href={`#${section.id}`}>{section.heading}</a>
								))}
							</nav>
						</aside>
						<article className="legal-body">
							{sections.map((section) => (
								<section key={section.id} id={section.id}>
									<h2>{section.heading}</h2>
									{section.body}
								</section>
							))}
						</article>
					</div>
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
				<>
					<p>
						This Privacy Policy explains how {LEGAL_NAME} {ENTITY_DEFINITION}{" "}
						collects, uses, shares, and protects information when you use our
						scheduling products and services (the "Service"). It applies to
						workplace owners, managers, workers, and anyone who visits our
						website or apps.
					</p>
					<p>
						For the personal data in a workplace — worker records, schedules,
						and messages — your employer or the workplace operator is the
						controller and we act as their processor. For your own account data
						and our website, we are the controller. See the{" "}
						<Link to="/dpa">Data Processing Addendum</Link> for how we process
						workplace data on behalf of business customers.
					</p>
				</>
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
								<li>
									<strong>Consent records</strong>, such as when you accepted
									these Terms and billing disclosures, so we can prove your
									choices.
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
									requests, trials, renewals, and service updates;
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
							<p>
								We do not sell your personal information, and we do not share it
								for cross-context behavioral advertising. We do not use your
								personal data to train third-party AI models.
							</p>
						</>
					),
				},
				{
					id: "legal-bases",
					heading: "3. Legal bases for processing",
					body: (
						<>
							<p>
								Where the GDPR or similar laws apply, we rely on the following
								legal bases:
							</p>
							<ul>
								<li>
									<strong>Contract</strong> — providing the Service, managing
									accounts, workplaces, schedules, and notifications you
									request.
								</li>
								<li>
									<strong>Legitimate interests</strong> — securing and
									troubleshooting the Service, preventing fraud and misuse, and
									measuring how features are used through pseudonymized product
									analytics (with session recording disabled). You can object to
									processing based on legitimate interests by contacting us.
								</li>
								<li>
									<strong>Consent</strong> — optional location features such as
									geofenced time entries, non-essential cookies on our website,
									and marketing communications. You can withdraw consent at any
									time.
								</li>
								<li>
									<strong>Legal obligation</strong> — keeping billing, tax, and
									consent records, and responding to lawful requests.
								</li>
							</ul>
						</>
					),
				},
				{
					id: "sharing",
					heading: "4. When we share information",
					body: (
						<>
							<p>We share information only as needed to run the Service:</p>
							<ul>
								<li>
									<strong>Within your workplace.</strong> Managers and
									authorized members can see schedule and work information for
									the locations they manage. Workers can generally see
									workplace-wide schedules and their own records.
								</li>
								<li>
									<strong>Service providers (subprocessors).</strong> These
									vendors help us run the Service, under contracts that limit
									their use of your data:
									<ul>
										{SUBPROCESSORS.map((subprocessor) => (
											<li key={subprocessor.name}>
												<strong>{subprocessor.name}</strong> —{" "}
												{subprocessor.purpose} ({subprocessor.location}).
											</li>
										))}
									</ul>
									The <Link to="/dpa#subprocessors">DPA</Link> carries the
									current list and the change-notice terms that apply to it.
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
							<p>
								We will notify business customers before adding or replacing any
								subprocessor that touches their workplace data, and they may
								object on reasonable grounds as described in the{" "}
								<Link to="/dpa">DPA</Link>.
							</p>
						</>
					),
				},
				{
					id: "retention",
					heading: "5. Data retention",
					body: (
						<>
							<p>We keep personal information only as long as needed:</p>
							<ul>
								<li>
									<strong>Account and profile data</strong> — while your account
									is active, then deleted or anonymized within{" "}
									{RETENTION.accountDataDays} days of closure.
								</li>
								<li>
									<strong>Workplace and scheduling data</strong> — while the
									workplace is active, then deleted or anonymized within{" "}
									{RETENTION.workplaceDataDays} days of workplace closure, so
									the team can export or revisit its schedule history first.
								</li>
								<li>
									<strong>Billing and tax records</strong> — up to{" "}
									{RETENTION.billingYears} years, as required by accounting and
									tax law.
								</li>
								<li>
									<strong>Consent records</strong> — at least{" "}
									{RETENTION.consentYears} years, to prove the choices you made.
								</li>
								<li>
									<strong>Application and device logs</strong> — up to{" "}
									{RETENTION.logDays} days.
								</li>
							</ul>
							<p>
								Where a longer period is required or permitted by law — for
								example an open dispute — we retain only what that purpose
								requires.
							</p>
						</>
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
							one where you live. Where personal data is transferred out of the
							EEA, the UK, or Switzerland, we rely on adequacy decisions or the
							European Commission's Standard Contractual Clauses (and the UK
							Addendum or Swiss annex where applicable) with the recipient. You
							can ask us for a copy of the transfer safeguards by writing to{" "}
							{LEGAL_ENTITY.privacyEmail}.
						</p>
					),
				},
				{
					id: "your-rights",
					heading: "8. Your rights and choices",
					body: (
						<>
							<p>
								Depending on where you live, you may have the following rights
								over your personal information:
							</p>
							<ul>
								<li>
									<strong>Access and portability</strong> — get a copy of your
									data, in a machine-readable format where required.
								</li>
								<li>
									<strong>Correction</strong> — fix inaccurate information.
								</li>
								<li>
									<strong>Deletion</strong> — ask us to delete your data.
								</li>
								<li>
									<strong>Restriction and objection</strong> — pause or object
									to certain processing, including processing based on
									legitimate interests.
								</li>
								<li>
									<strong>Withdrawal of consent</strong> — for optional location
									features, marketing, or cookies.
								</li>
								<li>
									<strong>Limit use of sensitive data</strong> (California) —
									precise geolocation collected for geofenced time entries is
									sensitive personal information. We use it only to provide the
									time-clock feature and never to infer characteristics about
									you; you may ask us to limit its use.
								</li>
								<li>
									<strong>No discrimination</strong> — we will never treat you
									differently for exercising these rights.
								</li>
							</ul>
							<p>
								You can manage much of your information directly in the Service,
								or make a request by email to {LEGAL_ENTITY.privacyEmail}. We
								respond within 45 days of a verifiable request, with a possible
								45-day extension for complex requests that we will explain to
								you. If you are in the EEA or the UK, you also have the right to
								lodge a complaint with your local supervisory authority (or the
								UK Information Commissioner's Office).
							</p>
							<p>
								Workplace members should direct requests about work records to
								their employer first, since the employer controls much of that
								data. We support employers in responding to valid requests.
							</p>
							<p>
								Where the law requires us to have one, or where it helps you
								reach us faster, you can contact our privacy team at{" "}
								{LEGAL_ENTITY.privacyEmail}; our registered office is{" "}
								{LEGAL_ENTITY.address}.
							</p>
						</>
					),
				},
				{
					id: "marketing",
					heading: "9. Marketing communications",
					body: (
						<p>
							We send service notifications (schedules, requests, billing and
							security notices) as part of the Service, so some of these cannot
							be switched off while your account is active — but you can tune
							them in Settings → Notifications. Where we send product marketing
							emails, every message includes an unsubscribe link, and you can
							opt out at any time by using that link or writing to us.
						</p>
					),
				},
				{
					id: "cookies",
					heading: "10. Cookies and similar technologies",
					body: (
						<>
							<p>We use cookies and similar technologies in two ways:</p>
							<ul>
								<li>
									<strong>Strictly necessary.</strong> Cookies that keep you
									signed in and keep the Service secure. These do not require
									consent because the Service cannot work without them.
								</li>
								<li>
									<strong>Analytics.</strong> On our marketing website,
									non-essential analytics cookies load only after you accept
									them in our consent banner; you can decline or withdraw
									consent at any time. Inside the signed-in product we run
									pseudonymized, first-party product analytics (session
									recording disabled) under legitimate interests, and you can
									object at any time via {LEGAL_ENTITY.privacyEmail}.
								</li>
							</ul>
							<p>
								You can also control cookies through your browser settings.
								Blocking some cookies may affect how the Service works.
							</p>
						</>
					),
				},
				{
					id: "children",
					heading: "11. Children's privacy",
					body: (
						<p>
							The Service is intended for workplaces and their workers. We do
							not knowingly collect personal information directly from children
							under 13 (or under the higher age set by your jurisdiction, up to
							the GDPR's default of 16) without appropriate consent. Hourly
							teams often include workers under 18: those workers join through
							an employer invitation, and the employer is responsible for
							obtaining any authorization required by law. If you believe a
							child has provided us information improperly, contact us and we
							will take appropriate steps.
						</p>
					),
				},
				{
					id: "changes",
					heading: "12. Changes to this policy",
					body: (
						<p>
							We may update this Privacy Policy from time to time. When we make
							material changes, we will update the date above and, where
							appropriate, notify you in the Service or by email. For existing
							subscribers we will give at least 30 days' notice of material
							changes before they take effect.
						</p>
					),
				},
				{
					id: "contact",
					heading: "13. Contact us",
					body: (
						<p>
							{LEGAL_NAME} is the controller for account and website data.
							Questions or requests about privacy can be sent to{" "}
							<a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>
								{LEGAL_ENTITY.privacyEmail}
							</a>
							{isSet(LEGAL_ENTITY.address)
								? ` or by post to ${LEGAL_ENTITY.address}`
								: ""}
							. We will respond as required by applicable law.
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
				<>
					<p>
						These Terms &amp; Conditions ("Terms") are an agreement between you
						and {LEGAL_NAME}
						{registrationSuffix()} {ENTITY_DEFINITION}. They govern your access
						to and use of the jooling websites, apps, and services for hourly
						teams (the "Service").
					</p>
					<p>
						By ticking the agreement box when you create an account, or by
						accessing or using the Service, you agree to these Terms. If you use
						the Service on behalf of a workplace, you represent that you have
						authority to bind that workplace to these Terms.
					</p>
				</>
			}
			sections={[
				{
					id: "accounts",
					heading: "1. Accounts and eligibility",
					body: (
						<>
							<p>
								To create or manage a workplace account you must be old enough
								to enter into a binding contract in your jurisdiction. You are
								responsible for the accuracy of the information you provide and
								for keeping your credentials secure.
							</p>
							<p>
								Workers may join through an employer invitation. Where a worker
								is below the age of contractual capacity, the inviting workplace
								(and, where required by law, a parent or guardian) is
								responsible for authorizing that use and for complying with
								applicable youth-employment and data protection laws.
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
					id: "data-processing",
					heading: "4. Data processing for workplaces",
					body: (
						<p>
							When your workplace uses the Service, your workplace is the
							controller of the worker records, schedules, and messages it
							stores, and jooling processes that data on the workplace's
							instructions as its processor. The{" "}
							<Link to="/dpa">Data Processing Addendum</Link> forms part of
							these Terms and describes our processing obligations, our
							subprocessors, security measures, and international transfer
							safeguards.
						</p>
					),
				},
				{
					id: "billing",
					heading: "5. Plans, billing, free trials, and renewals",
					body: (
						<>
							<p>
								Paid plans are billed per location on a monthly or annual basis,
								as selected at checkout. All fees are stated — including the
								price, the billing period, and what happens at the end of a
								trial — before you enter any payment details.
							</p>
							<ul>
								<li>
									New workplaces may receive a 30-day free trial, and workplaces
									that qualify for the new-restaurant offer may receive a 90-day
									free trial instead. Before you check out we display the trial
									length, the plan and price that begins when the trial ends,
									the date of the first charge, and how to cancel. Your selected
									plan begins automatically at the end of the trial unless you
									cancel in your billing settings before then, and we will
									remind you in the Service at least 7 days before that happens.
								</li>
								<li>
									Subscriptions renew automatically at the end of each billing
									period until cancelled. For annual plans, we will remind you
									in the Service at least 30 days before each renewal. You can
									cancel at any time in your billing settings; cancellation
									takes effect at the end of the current period.
								</li>
								<li>
									We will give you at least 30 days' notice in the Service
									before any price change takes effect for your subscription;
									changes never apply to your current billing period.
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
							<p>
								We keep a record of your acceptance of these billing terms
								(version, date, and context) for at least{" "}
								{RETENTION.consentYears} years.
							</p>
						</>
					),
				},
				{
					id: "acceptable-use",
					heading: "6. Acceptable use",
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
					heading: "7. Intellectual property and content",
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
					heading: "8. Third-party services",
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
					heading: "9. Disclaimers",
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
					heading: "10. Limitation of liability",
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
					heading: "11. Indemnification",
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
					heading: "12. Suspension and termination",
					body: (
						<p>
							You may stop using the Service at any time and may cancel your
							subscription in your billing settings. We may suspend or terminate
							access if you materially breach these Terms and do not correct the
							breach within 14 days of our notice, or immediately where required
							to respond to a security incident, an unlawful use, a legal
							obligation, or non-payment. Where practicable we will tell you
							before suspension and explain what is needed to restore access.
							Before deleting a closed workplace's data we will — where possible
							— make an export available as described in the Privacy Policy.
							Sections that by their nature should survive termination, such as
							intellectual property, disclaimers, liability, indemnity, and data
							processing, will survive.
						</p>
					),
				},
				{
					id: "governing-law",
					heading: "13. Governing law and disputes",
					body: (
						<>
							{isSet(LEGAL_ENTITY.governingLaw) ? (
								<p>
									These Terms are governed by {LEGAL_ENTITY.governingLaw},
									without regard to conflict of law rules.
								</p>
							) : null}
							<p>
								{isSet(LEGAL_ENTITY.venue)
									? `The exclusive venue for any dispute is ${LEGAL_ENTITY.venue}, except that either party may bring a claim`
									: "Either party may bring a claim"}{" "}
								in its local small-claims or consumer court where local law
								gives it that right. Before filing a formal claim, you agree to
								try to resolve any dispute informally by contacting us — we will
								respond within 30 days. Nothing in these Terms limits rights you
								may have under mandatory local law, including the law of your
								usual residence where it protects consumers.
							</p>
						</>
					),
				},
				{
					id: "changes",
					heading: "14. Changes to these Terms",
					body: (
						<p>
							We may update these Terms from time to time. When we make material
							changes, we will update the date above and, for existing
							subscribers, notify you in the Service at least 30 days before the
							changes take effect. Your continued use of the Service after an
							update takes effect means you accept the revised Terms.
						</p>
					),
				},
				{
					id: "contact",
					heading: "15. Contact us",
					body: (
						<p>
							{entityLine([LEGAL_ENTITY.legalName, LEGAL_ENTITY.address])
								? `${withPeriod(
										entityLine([LEGAL_ENTITY.legalName, LEGAL_ENTITY.address]),
									)} `
								: ""}
							Questions about these Terms can be sent to{" "}
							<a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>
								{LEGAL_ENTITY.contactEmail}
							</a>
							. For product help, reach us at{" "}
							<a href={`mailto:${LEGAL_ENTITY.supportEmail}`}>
								{LEGAL_ENTITY.supportEmail}
							</a>
							.
						</p>
					),
				},
			]}
		/>
	);
}
