#!/usr/bin/env bash
# Idempotent dependency install for the Cloud Agent environment.
# Runs after the repository is checked out. Must terminate and start no
# long-lived processes (those belong in start.sh).
#
# This script is self-bootstrapping: it installs the toolchain (Bun, Docker,
# Supabase CLI) when it is missing, so the environment works from a plain
# base image as well as from a snapshot that already contains these tools.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log() { echo "[install] $*"; }

BUN_VERSION="1.3.11"

# --- Bun (repo-pinned) ---
if [ ! -x "$HOME/.bun/bin/bun" ] && ! command -v bun >/dev/null 2>&1; then
  log "installing bun ${BUN_VERSION}"
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi
export PATH="$HOME/.bun/bin:$PATH"

# --- Docker (nested) + helpers ---
if ! command -v docker >/dev/null 2>&1; then
  log "installing docker + helpers"
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io docker-compose-v2 fuse-overlayfs iptables
fi
# Nested Docker container networking needs the legacy iptables backend.
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true
# Let the current user talk to the Docker socket without sudo.
sudo usermod -aG docker "$(id -un)" 2>/dev/null || true

# --- Supabase CLI ---
if ! command -v supabase >/dev/null 2>&1; then
  log "installing supabase CLI"
  arch="$(dpkg --print-architecture)"
  curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${arch}.tar.gz" -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp supabase
  sudo mv /tmp/supabase /usr/local/bin/supabase
fi

log "bun $(bun --version) | docker $(docker --version | awk '{print $3}' | tr -d ,) | supabase $(supabase --version)"

# --- Workspace dependencies ---
bun install --frozen-lockfile

log "done"
