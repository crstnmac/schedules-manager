# Switching funnel

Events are emitted from the landing site and web app when the PostHog project token is configured:

1. `comparison_page_viewed` — anonymous landing visitor, `competitor` and `path`.
2. `comparison_signup_clicked` — click to the signup form, `competitor`.
3. `user_signed_up` — identified account, `switching_from` when known from the comparison URL.
4. `workplace_created` — identified account, self-reported `switching_from` from onboarding.
5. `schedule_import_completed` — manager committed an import.
6. `schedule_published` — manager published a version; this is activation.

Use a PostHog funnel from `user_signed_up` to `schedule_published`, broken down by `switching_from`. The comparison page events are on a separate origin and may remain anonymous, so compare their aggregate counts and click-through rate separately unless cross-domain identity is explicitly configured. Count one activated workplace per workplace ID, not one per publish. The onboarding field is self-reported and may differ from the link parameter. Review weekly: comparison visits, signup clicks, signup-to-workplace rate, workplace-to-import rate, and workplace-to-first-publish rate. No analytics event is proof of notification delivery.

Set `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` for **both** landing and web deployments. The event code is inert if the token is absent.
