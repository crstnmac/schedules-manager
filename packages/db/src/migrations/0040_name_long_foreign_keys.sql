-- The generated names of these foreign keys exceed PostgreSQL's 63-byte
-- identifier limit, so the database stored truncated names that never matched
-- the schema. Rename them in place (no re-validation, no table rewrite).
ALTER TABLE "leave_approval_delegations" RENAME CONSTRAINT "leave_approval_delegations_delegator_employment_id_employments_" TO "leave_approval_delegations_delegator_fk";
--> statement-breakpoint
ALTER TABLE "leave_approval_delegations" RENAME CONSTRAINT "leave_approval_delegations_delegate_employment_id_employments_i" TO "leave_approval_delegations_delegate_fk";
--> statement-breakpoint
ALTER TABLE "leave_request_approvals" RENAME CONSTRAINT "leave_request_approvals_approver_employment_id_employments_id_f" TO "leave_request_approvals_approver_fk";
--> statement-breakpoint
ALTER TABLE "leave_request_approvals" RENAME CONSTRAINT "leave_request_approvals_escalation_employment_id_employments_id" TO "leave_request_approvals_escalation_fk";
--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "notification_preferences" SET DEFAULT '{"timeOff":true,"messages":true,"schedule":true,"timeClock":true}'::jsonb;
