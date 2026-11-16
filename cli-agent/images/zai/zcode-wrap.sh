#!/bin/sh
set -eu
HOME="${HOME:-/home}"
PROVIDER="${ZCODE_PROVIDER:-custom}"
MODEL="${ZCODE_MODEL:-}"
BASE_URL="${ZCODE_BASE_URL:-${OPENAI_BASE_URL:-${ZAI_BASE_URL:-}}}"
API_KEY="${OPENAI_API_KEY:-${ZAI_API_KEY:-ollama}}"

if [ -n "$BASE_URL" ] && [ -n "$MODEL" ]; then
  mkdir -p "$HOME/.zcode/v2"
  esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
  cat >"$HOME/.zcode/v2/provider_config.json" <<EOF
{
  "schemaVersion": 1,
  "config": {
    "providerConfigRules": {
      "providerRules": [
        {
          "providerId": "$(esc "$PROVIDER")",
          "templateId": null,
          "providerName": "$(esc "$PROVIDER")",
          "enabled": true,
          "config": {
            "group": "standard-personal",
            "logo": null,
            "access": {
              "type": "api-key",
              "apiKey": "$(esc "$API_KEY")",
              "apiKeyManagementUrl": null
            },
            "api": {
              "type": "openai-chat-completions",
              "baseUrl": "$(esc "$BASE_URL")",
              "headers": {}
            },
            "personalModelIds": ["$(esc "$MODEL")"],
            "modelOrder": ["$(esc "$MODEL")"],
            "visibility": "visible"
          }
        }
      ]
    },
    "modelConfigRules": {
      "providerModelRules": [
        {
          "providerId": "$(esc "$PROVIDER")",
          "modelId": "$(esc "$MODEL")",
          "config": { "enabled": true }
        }
      ],
      "manualProviderModelRules": []
    },
    "providerOrder": ["$(esc "$PROVIDER")"],
    "defaultModelSelection": {
      "providerId": "$(esc "$PROVIDER")",
      "modelId": "$(esc "$MODEL")",
      "options": { "reasoningLevel": "disabled" }
    }
  }
}
EOF
fi

REAL=/usr/local/bin/zcode.real
if [ ! -x "$REAL" ]; then
  REAL="$(command -v zcode.real 2>/dev/null || true)"
fi
exec "$REAL" "$@"
