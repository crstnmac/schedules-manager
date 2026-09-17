# Competitor Google Play reviews — lead mining (2026-09-17)

Source: newest ~150 reviews per app scraped from Google Play (US, English), filtered to 1–2★.
Full dataset: `gplay-competitor-low-star-reviews.csv` (444 reviews) and `.json` in this folder.

## State of the market (newest-150 window)

| App | Play score | Total ratings | 1–2★ in recent 150 | Trend read |
| --- | --- | --- | --- | --- |
| Sling | 4.21 | 10,234 | **93 (62%)** | Android app actively breaking; managers blocked from core workflow |
| HotSchedules | 3.50 | 24,962 | **104 (69%)** | Legacy, worst-rated; $2.99 employee paywall breeds resentment |
| Planday | 4.42 | 19,956 | 74 (49%) | Annual-leave/hours handling complaints (EU-heavy market) |
| Homebase | 4.15 | 24,655 | 60 (40%) | Recent Android "Timesheets" update rage; billing/support trust issues |
| Connecteam | 4.77 | 29,103 | 56 (37%) | Performance/battery complaints despite high score |
| 7shifts | 4.61 | 9,014 | 26 (17%) | Shift-swap ("up for grabs") reliability glitches |
| Deputy | 4.70 | 19,477 | 15 (10%) | Mostly cancellation/billing friction |
| When I Work | 4.75 | 76,245 | 9 (6%) | Healthy on Android; a few post-acquisition regressions |
| Zoho Shifts | 3.45 | 89 | 7 | Tiny sample; immaterial |

## Recurring complaint themes → Jooling positioning wins

1. **Notifications that silently die** (Sling, Connecteam, HotSchedules, When I Work). "unreliable notifications", "hardly ever get notifications". Jooling already treats publish/version/notify as the core loop — make notification reliability the headline.
2. **Android as the neglected platform** (Sling, HotSchedules). Jooling is Expo — Android/iOS parity by construction; say it out loud.
3. **Charging workers for the app** (HotSchedules $2.99). A "free for your whole team, forever" line lands hard against this.
4. **Mobile manager workflow broken** (Sling: can't edit shifts from phone; Homebase: timesheet update regressed). Jooling's manager web + mobile board is exactly this gap.
5. **Unresponsive support / cancellation fights** (Sling, Deputy, Homebase). Human support and one-click cancel are cheap trust differentiators.
6. **Shift-swap correctness** (7shifts: wrong person shown, shifts go missing). Published-schedule immutability + correct swap state is a Jooling architectural advantage — market it.
7. **Post-acquisition decay** (When I Work reviewer cites "Ripply"). WIW's installed base is primed for "built by a team that answers to you, not an acquirer" messaging.

## Curated leads (recent, manager/owner signal, quoted)

| # | Who | App | Date | What they said |
| --- | --- | --- | --- | --- |
| 1 | Todd Mayville | Sling | 2026-07-23 | "I know which app I will NOT use when I get my restaurant open." — a soon-to-open restaurant already shopping |
| 2 | Edmund Campbell-Webb | Sling | 2026-06-27 | "RUNNING MY BUSINESS AND CANNOT USE IT AS INTENDED" — crashes/logouts on Android |
| 3 | Jennifer Ritter | Sling | 2026-07-06 | "I can no longer update my employees shifts through my phone." |
| 4 | Carrie Everhart | Sling | 2026-07-02 | "my staff are having issues too… support weeks ago… nothing has [changed]" — admin UI broken, support ghosting |
| 5 | Raul Goncalves | Homebase | 2026-09-13 | "I manage two business locations and pay for Homebase for both" — Android timesheet update broke his workflow |
| 6 | Malkolm Webb | Homebase | 2026-08-17 | Restaurant/bar operator: "missing paychecks for your staff… Stick to Toast" — actively evaluating alternatives |
| 7 | Katrina Thurston | When I Work | 2026-08-26 | "was purchased by Ripply and sucks now" — overnight-shift display confusion |
| 8 | Adam Brock | HotSchedules | 2026-04-01 (👍21) | "complete waste of money… unable to [set up] account" — onboarding failure, high upvotes |
| 9 | parris bates | HotSchedules | 2026-01-17 (👍7) | "how come the android version doesn't have the same features as ios?" — parity gap |
| 10 | Sür Easley | HotSchedules | 2026-09-07 | "Charging employees for an app that a company is already paying for is ridiculous" |
| 11 | Jen Ann | 7shifts | 2026-05-30 (👍6) | Shifts-up-for-grabs feature "showing the wrong person… half the time the shifts go missing" |
| 12 | Jovan Jovanovic | Deputy | 2026-08-12 | Subscription-cancellation fight with support — wants out |
| 13 | Christopher Parker | Sling | 2026-06-26 (👍8) | "notifications won't work after a week, and the whole app crashes" |
| 14 | Theo Francis | Sling | 2026-06-09 (👍10) | Broken calendar swipe + "I also hardly ever get notifications" |

Caveat: Google Play reviewer names are display names, not verified identities with emails. These are
**qualitative leads** — use them for positioning, and find the same voices in manager communities
(r/restaurateur, Facebook owner groups) where they post with company context. Reviews on Play cannot
be replied to by non-developers, so direct contact channels are the community routes above.

## Suggested plays

- **Sling migration hook**: "Switching from Sling? Import your schedule in one afternoon." Sling's recent 1–2★ rate (62%) is an active migration window.
- **HotSchedules end-of-life pitch**: worst-rated incumbent (3.5★/25k) with pay-for-employee resentment — target restaurants still on it.
- **Android parity claim**: one-line differentiator versus Sling and HotSchedules, backed by Expo.
- **SEO**: publish comparison pages "Jooling vs Sling / HotSchedules / Homebase" capturing the exact switch searches these reviewers will run next.
