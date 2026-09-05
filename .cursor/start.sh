#!/usr/bin/env bash
# Per-boot startup for the Cloud Agent environment.
# Brings up the local infrastructure the apps depend on:
#   - Docker daemon (nested, fuse-overlayfs + legacy iptables)
#   - Local Supabase stack (Postgres + Auth) via the committed supabase/config.toml
#   - Generates local .env files from the running Supabase instance
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

# 3. Bring up the local Supabase stack (idempotent; no-op if already running).
if ! supabase status >/dev/null 2>&1; then
  log "starting supabase"
  supabase start || { log "retrying supabase start"; supabase stop --no-backup >/dev/null 2>&1 || true; supabase start; }
fi
supabase status >/dev/null 2>&1 || { log "ERROR: supabase did not become ready"; exit 1; }
log "supabase is up"

# 4. Generate local .env files from the running Supabase instance.
eval "$(supabase status -o env | sed 's/^/SB_/')"
server_env="apps/server/.env"
web_env="apps/web/.env"
native_env="apps/native/.env"

cat > "$server_env" <<EOF
CORS_ORIGIN=http://localhost:3001
DATABASE_URL=${SB_DB_URL}
DATABASE_POOL_MAX=5
SUPABASE_URL=${SB_API_URL}
APP_URL=http://localhost:3001
ZEPTOMAIL_TOKEN="Zoho-enczapikey local-dev-placeholder-token"
ZEPTOMAIL_FROM_ADDRESS=schedules@example.com
ZEPTOMAIL_FROM_NAME=Schedules Manager
ZEPTOMAIL_API_URL=api.zeptomail.com/
EOF

cat > "$web_env" <<EOF
VITE_SERVER_URL=http://localhost:3000
VITE_SUPABASE_URL=${SB_API_URL}
VITE_SUPABASE_ANON_KEY=${SB_ANON_KEY}
EOF

cat > "$native_env" <<EOF
EXPO_PUBLIC_SERVER_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=${SB_API_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${SB_ANON_KEY}
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

log "ready — API on :3000, web on :3001, Supabase Studio on :54323"
