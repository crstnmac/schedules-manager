#!/usr/bin/env bash
# Idempotent dependency install for the Cloud Agent environment.
# Runs after the repository is checked out. Must terminate and start no
# long-lived processes (those belong in start.sh / terminals).
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "[install] bun $(bun --version)"
bun install --frozen-lockfile

echo "[install] done"
