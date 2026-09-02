#!/bin/sh
set -eu

compose_file="compose.integration.yml"

cleanup() {
	docker compose -f "$compose_file" down --volumes >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker compose -f "$compose_file" up --detach --wait

RUN_INTEGRATION_TESTS=1 \
DATABASE_URL="postgresql://schedules_manager_test:schedules_manager_test@127.0.0.1:55432/schedules_manager_test" \
CORS_ORIGIN="http://localhost:3001" \
SUPABASE_URL="http://127.0.0.1:54321" \
APP_URL="http://localhost:3001" \
ZEPTOMAIL_TOKEN="integration-test-token" \
ZEPTOMAIL_FROM_ADDRESS="schedules@example.test" \
bun test apps/server/test/integration
