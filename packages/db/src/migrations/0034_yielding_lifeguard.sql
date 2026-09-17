-- Carry forward the latest assigned approval group in each Workplace. Existing
-- Workplace switches already override groups, so preserve them with OR.
WITH latest_group AS (
	SELECT DISTINCT ON (location."workplace_id")
		location."workplace_id",
		schedule."policy_group_id" AS "group_id"
	FROM "schedules" schedule
	JOIN "locations" location ON location."id" = schedule."location_id"
	WHERE schedule."policy_group_id" IS NOT NULL
	ORDER BY location."workplace_id", schedule."week_start_date" DESC,
		schedule."updated_at" DESC, schedule."id" DESC
), selected_rules AS (
	SELECT latest_group."workplace_id",
		bool_or(rule."request_type" = 'shift_release' AND NOT rule."requires_approval") AS "release",
		bool_or(rule."request_type" = 'shift_pickup' AND NOT rule."requires_approval") AS "pickup"
	FROM latest_group
	LEFT JOIN "approval_policy_rules" rule ON rule."group_id" = latest_group."group_id"
	GROUP BY latest_group."workplace_id"
)
UPDATE "workplaces" workplace
SET "auto_accept_shift_releases" = workplace."auto_accept_shift_releases" OR coalesce(selected_rules."release", false),
	"auto_accept_shift_pickups" = workplace."auto_accept_shift_pickups" OR coalesce(selected_rules."pickup", false)
FROM selected_rules
WHERE workplace."id" = selected_rules."workplace_id";
--> statement-breakpoint
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_policy_group_id_approval_policy_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "schedules" DROP COLUMN "policy_group_id";
--> statement-breakpoint
DROP TABLE "approval_policy_rules";
--> statement-breakpoint
DROP TABLE "approval_policy_groups";
--> statement-breakpoint
DROP TYPE "public"."approval_request_type";
