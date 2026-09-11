#!/usr/bin/env bash
# Per-boot startup for the Cloud Agent environment.
# Brings up the local infrastructure the apps depend on:
#   - Docker daemon (nested, fuse-overlayfs + legacy iptables)
#   - Local PostgreSQL 18 container
#   - Generates local .env files for the API and clients
#   - Applies the Drizzle schema to the local database
# It is idempotent, tolerates restarts, and returns once services are ready.
# The API and web dev servers run as `terminals` (see environment.json).
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log() { echo "[start] $*"; }

# 1. Nested Docker needs the legacy iptables backend for container networking.
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true

# 2. Start the Docker daemon if it is not already responding.
if ! docker info >/dev/null 2>&1; then
  log "starting dockerd"
  sudo rm -f /var/run/docker.pid /var/run/docker/containerd/containerd.pid 2>/dev/null || true
  sudo bash -c 'nohup dockerd --storage-driver=fuse-overlayfs >/var/log/dockerd.log 2>&1 &'
  for _ in $(seq 1 60); do
    [ -S /var/run/docker.sock ] && break
    sleep 1
  done
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
fi
docker info >/dev/null 2>&1 || { log "ERROR: dockerd did not become ready"; exit 1; }
log "docker $(docker version --format '{{.Server.Version}}')"

# 3. Bring up standalone PostgreSQL 18 (idempotent; data survives restarts).
postgres_container="schedules-manager-postgres18"
if ! docker inspect "$postgres_container" >/dev/null 2>&1; then
  docker run --detach \
    --name "$postgres_container" \
    --env POSTGRES_DB=schedules_manager \
    --env POSTGRES_USER=schedules_manager \
    --env POSTGRES_PASSWORD=schedules_manager \
    --publish 127.0.0.1:55432:5432 \
    --volume schedules-manager-postgres18:/var/lib/postgresql \
    --health-cmd 'pg_isready -U schedules_manager -d schedules_manager' \
    --health-interval 1s --health-timeout 3s --health-retries 30 \
    postgres:18-alpine >/dev/null
elif [ "$(docker inspect --format '{{.State.Running}}' "$postgres_container")" != "true" ]; then
  docker start "$postgres_container" >/dev/null
fi
for _ in $(seq 1 30); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$postgres_container")" = "healthy" ] && break
  sleep 1
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "$postgres_container")" = "healthy" ] || { log "ERROR: PostgreSQL did not become ready"; exit 1; }
log "PostgreSQL 18 is up"

# 4. Generate local .env files.
server_env="apps/server/.env"
web_env="apps/web/.env"
native_env="apps/native/.env"

cat > "$server_env" <<EOF
CORS_ORIGIN=http://localhost:3001
DATABASE_URL=postgresql://schedules_manager:schedules_manager@127.0.0.1:55432/schedules_manager
DATABASE_POOL_MAX=5
APP_URL=http://localhost:3001
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=local-development-secret-change-before-production
ZEPTOMAIL_TOKEN="Zoho-enczapikey local-dev-placeholder-token"
ZEPTOMAIL_FROM_ADDRESS=schedules@example.com
ZEPTOMAIL_FROM_NAME=Schedules Manager
ZEPTOMAIL_API_URL=api.zeptomail.com/
EOF

cat > "$web_env" <<EOF
VITE_SERVER_URL=http://localhost:3000
EOF

cat > "$native_env" <<EOF
EXPO_PUBLIC_SERVER_URL=http://localhost:3000
EOF
log "wrote local .env files"

# 5. Apply the Drizzle schema to the local database.
( cd packages/db && bun run drizzle-kit push --force )
log "database schema applied"

# 6. Launch the API and web dev servers in the background (idempotent).
if ! curl -sf http://localhost:3000/health >/dev/null 2>&1; then
  log "starting API dev server (:3000)"
  nohup bash -lc "cd '$repo_root' && export PATH=\"\$HOME/.bun/bin:\$PATH\" && bun run dev:server" \
    >/tmp/api-server.log 2>&1 &
  disown || true
fi
if ! curl -sf http://localhost:3001/ >/dev/null 2>&1; then
  log "starting web dev server (:3001)"
  nohup bash -lc "cd '$repo_root' && export PATH=\"\$HOME/.bun/bin:\$PATH\" && bun run dev:web" \
    >/tmp/web-dev.log 2>&1 &
  disown || true
fi

# Give the servers a moment and report readiness (non-fatal).
for _ in $(seq 1 30); do
  curl -sf http://localhost:3000/ready >/dev/null 2>&1 && break
  sleep 1
done
curl -sf http://localhost:3000/ready >/dev/null 2>&1 && log "API is ready (/ready)" || log "NOTE: API not confirmed ready yet; see /tmp/api-server.log"

log "ready — API on :3000, web on :3001, PostgreSQL 18 on :55432"
