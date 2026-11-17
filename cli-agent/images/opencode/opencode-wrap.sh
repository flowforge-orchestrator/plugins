#!/bin/sh
set -eu
HOME="${HOME:-/home}"
CONFIG_DIR="$HOME/.config/opencode"
mkdir -p "$CONFIG_DIR"

BASE_URL="${OPENCODE_BASE_URL:-${OPENAI_BASE_URL:-}}"
PROVIDER="${OPENCODE_PROVIDER:-ollama}"
MODEL="${OPENCODE_MODEL:-}"
API_KEY="${OPENAI_API_KEY:-ollama}"

if [ -n "$BASE_URL" ] && [ -n "$MODEL" ]; then
  # Escape for JSON string values
  esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
  cat >"$CONFIG_DIR/opencode.json" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "$(esc "$PROVIDER")": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "$(esc "$PROVIDER")",
      "options": {
        "baseURL": "$(esc "$BASE_URL")",
        "apiKey": "$(esc "$API_KEY")"
      },
      "models": {
        "$(esc "$MODEL")": { "name": "$(esc "$MODEL")" }
      }
    }
  },
  "model": "$(esc "$PROVIDER")/$(esc "$MODEL")"
}
EOF
fi

REAL="$(command -v opencode.real 2>/dev/null || true)"
if [ -z "$REAL" ]; then
  REAL=/usr/local/bin/opencode.real
fi
exec "$REAL" "$@"
