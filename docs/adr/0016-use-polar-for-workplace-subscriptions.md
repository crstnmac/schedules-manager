# Use Polar for Workplace subscriptions

jooling bills the employer, never the Worker. A subscription belongs to a Workplace and is priced per active Location with unlimited Workers and Managers. The public catalog has Schedule at $39 per Location monthly or $372 annually, and Operations at $79 per Location monthly or $756 annually. Both begin with a 30-day trial.

Polar hosts checkout, tax collection, invoices, payment methods, cancellation, and the customer portal. The Workplace UUID is Polar's external customer ID. Checkout metadata records the plan, interval, Workplace, and Location count. Signed subscription webhooks are the source of truth for local subscription status; the success redirect is only presentation and never grants access.

Schedule contains the product's trust guarantees: versioned publication, change history, acknowledgement, late-change acceptance, availability, coverage, and communication. Operations adds time clock, attendance, timesheets, automation, and labor reporting. Worker schedule access and historical records must not be removed when a Workplace downgrades or stops paying.

Production setup requires `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, and `POLAR_MODE=production`. Register the public API endpoint `POST /v1/webhooks/polar` for subscription created, updated, active, canceled, uncanceled, past-due, and revoked events. Apply database migration `0024_mysterious_human_robot.sql` before deploying the server. Sandbox catalogs use separate Polar IDs and can override all four product IDs through the documented environment variables.
