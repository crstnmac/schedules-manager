DELETE FROM "shift_pickups" AS duplicate
USING "shift_pickups" AS keeper
WHERE duplicate."open_shift_id" = keeper."open_shift_id"
	AND duplicate."requested_by" = keeper."requested_by"
	AND (
		duplicate."created_at" > keeper."created_at"
		OR (
			duplicate."created_at" = keeper."created_at"
			AND duplicate."id" > keeper."id"
		)
	);
--> statement-breakpoint
ALTER TABLE "shift_pickups" ADD CONSTRAINT "shift_pickups_open_shift_requester_unique" UNIQUE("open_shift_id","requested_by");
