#!/usr/bin/env bash
# Remove private plugin directories from entire git history.
# Requires: git-filter-repo (pip install git-filter-repo)
#
# WARNING: rewrites history — coordinate force-push with the team.
# After run: git remote add origin git@github.com:flowforge-orchestrator/plugins.git
#            git push --force-with-lease origin main

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install: pip install git-filter-repo" >&2
  exit 1
fi

PATHS=(
  ozon
  wildberries
  macos-notify
  harness
)

echo "Purging from history: ${PATHS[*]}"
git filter-repo --force --invert-paths \
  --path ozon \
  --path wildberries \
  --path macos-notify \
  --path harness

echo "Done. Verify:"
git log --all --oneline -- "${PATHS[@]}" || true
git ls-files "${PATHS[@]}" || true
