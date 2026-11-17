#!/bin/sh
set -eu
# Pass-through to the real Cursor Agent CLI. No OpenAI chat/completions bridge —
# local Ollama is unsupported by Cursor Agent; callers get an honest CLI failure.

REAL="${CURSOR_AGENT_REAL:-/usr/local/bin/cursor-agent.real}"
if [ ! -x "$REAL" ] && [ -x /root/.local/bin/agent ]; then
  REAL=/root/.local/bin/agent
fi
if [ ! -x "$REAL" ] && [ -x /home/.local/bin/agent ]; then
  REAL=/home/.local/bin/agent
fi
if [ ! -x "$REAL" ] && [ -x /usr/local/bin/agent ]; then
  REAL=/usr/local/bin/agent
fi
if [ ! -x "$REAL" ]; then
  echo "cursor-agent: real Cursor Agent CLI is not installed in this image" >&2
  exit 127
fi
exec "$REAL" "$@"
