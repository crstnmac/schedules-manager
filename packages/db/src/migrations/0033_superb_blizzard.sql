-- Preserve distinct day-part windows before removing the duplicate catalog.
INSERT INTO "time_blocks" ("id", "location_id", "name", "start_minute", "end_minute")
SELECT
	part."id",
	part."location_id",
	CASE
		WHEN EXISTS (
			SELECT 1 FROM "time_blocks" block
			WHERE block."location_id" = part."location_id" AND block."name" = part."name"
		) THEN left(part."name", 24) || ' (' || left(part."id"::text, 12) || ')'
		ELSE part."name"
	END,
	part."start_minute",
	part."end_minute"
FROM "day_parts" part
WHERE NOT EXISTS (
	SELECT 1 FROM "time_blocks" block
	WHERE block."location_id" = part."location_id"
		AND block."name" = part."name"
		AND block."start_minute" = part."start_minute"
		AND block."end_minute" = part."end_minute"
);
--> statement-breakpoint
DROP TABLE "day_parts" CASCADE;
