-- Cursor pagination on workplace_messages.created_at round-trips the
-- boundary timestamp through a JS Date (millisecond precision): the server
-- serializes with toISOString() and re-parses with new Date(), and the pg
-- driver only carries milliseconds. The default timestamptz column stores
-- microseconds, so a now()-generated tie with a nonzero microsecond tail
-- truncated the cursor *below* its stored value and made the older tied row
-- unreachable across a page split (the eq(... before) tie-break guard was
-- dead for the same precision reason). Quantize the column to milliseconds
-- so the cursor and stored value share one total order; eq/lt then match
-- exactly. Backfill truncates (not rounds) to match toISOString() semantics.
UPDATE "workplace_messages" SET "created_at" = date_trunc('milliseconds', "created_at");--> statement-breakpoint
ALTER TABLE "workplace_messages" ALTER COLUMN "created_at" TYPE timestamp (3) with time zone;--> statement-breakpoint
