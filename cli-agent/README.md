# @conveyor/plugin-cli-agent

Runs interchangeable CLI coding agents as one-shot Docker containers behind a shared process contract.

## Purpose

The catalog publishes executors for one-shot Docker containers of CLI coding agents, their LLM config, tools, skills, rules, and an A2A factory command. OSS agents take provider and model from `llm-config` or `llm-config.gigachat`. Cursor, Codex, and Claude Code use a native model select and their own cloud CLIs. Each agent run creates a hardened container with outbound bridge networking, stream byte caps, and removal after completion.

## Nodes

| nodeType | Name | Role |
| --- | --- | --- |
| `plugin.cli-agent.llm-config` | CLI LLM config | Shared provider/model/baseUrl/`apiKey` ref → opaque `llmConfig`. See `src/tools/llm-config/help.md`. |
| `plugin.cli-agent.llm-config.gigachat` | CLI LLM config (GigaChat) | Secret `GIGACHAT_AUTH_KEY` → OAuth → `llmConfig`. See `src/tools/gigachat-config/help.md`. |
| `plugin.cli-agent.tool-instance` | CLI tool instance | Meta plus JavaScript source → one tool instance. See `src/tools/tool-instance/help.md`. |
| `plugin.cli-agent.tool-provider` | CLI tool provider | Tool instances → opaque `mcpAttach`. See `src/tools/tool-provider/help.md`. |
| `plugin.cli-agent.skill-instance` | CLI skill instance | Name plus `SKILL.md` body → one skill instance. See `src/tools/skill-instance/help.md`. |
| `plugin.cli-agent.skill-provider` | CLI skill provider | Skill instances → opaque `skillAttach`. See `src/tools/skill-provider/help.md`. |
| `plugin.cli-agent.rules-instance` | CLI rules instance | Name plus rules body → one rules instance. See `src/tools/rules-instance/help.md`. |
| `plugin.cli-agent.rules-provider` | CLI rules provider | Rules instances → opaque `rulesAttach`. See `src/tools/rules-provider/help.md`. |
| `plugin.cli-agent.hermes` | CLI agent: Hermes | One-shot Hermes container. See `src/agents/hermes/help.md`. |
| `plugin.cli-agent.claude-code` | CLI agent: Claude Code | One-shot `claude -p` container and native model select. See `src/agents/claude-code/help.md`. |
| `plugin.cli-agent.codex` | CLI agent: Codex | One-shot `codex exec` container and native model select. See `src/agents/codex/help.md`. |
| `plugin.cli-agent.cursor` | CLI agent: Cursor | One-shot Cursor agent container and native model select. See `src/agents/cursor/help.md`. |
| `plugin.cli-agent.aider` | CLI agent: Aider | One-shot Aider container. See `src/agents/aider/help.md`. |
| `plugin.cli-agent.opencode` | CLI agent: OpenCode | One-shot `opencode run` container. See `src/agents/opencode/help.md`. |
| `plugin.cli-agent.zai` | CLI agent: Z.ai | One-shot `zcode` container. See `src/agents/zai/help.md`. |
| `plugin.cli-agent.kilo` | CLI agent: Kilo Code | One-shot Kilo container. See `src/agents/kilo/help.md`. |
| `plugin.cli-agent.cline` | CLI agent: Cline | One-shot Cline container. See `src/agents/cline/help.md`. |
| `plugin.cli-agent.pi` | CLI agent: pi | One-shot pi container. See `src/agents/pi/help.md`. |
| `plugin.cli-agent.qwen` | CLI agent: Qwen Code | One-shot Qwen container. See `src/agents/qwen/help.md`. |
| `plugin.cli-agent.goose` | CLI agent: goose | One-shot goose container. See `src/agents/goose/help.md`. |
| `plugin.cli-agent.crush` | CLI agent: Crush | One-shot Crush container. See `src/agents/crush/help.md`. |
| `plugin.cli-agent.openclaw` | CLI agent: OpenClaw | One-shot OpenClaw container. See `src/agents/openclaw/help.md`. |
| `plugin.cli-agent.openhands` | CLI agent: OpenHands | One-shot OpenHands container. See `src/agents/openhands/help.md`. |
| `plugin.cli-agent.factory` | CLI agent factory (A2A) | Orchestrator starts a team and talks through `a2a_*` tools. See `src/a2a/help.md`. |
| `plugin.cli-agent.agent-profile` | CLI agent profile (A2A) | Named team role chained into the factory. See `src/a2a/profile/help.md`. |

Agent nodes share tag `cli-agent` and the DTO in `src/contract/cli-agent.io.ts`. Design notes: `docs/adr/0001-cli-agent-sandbox.md`.

## Editor configuration

Enable the plugin for the workspace. Shared ports: **task**, **llmConfig**, **mcpAttach** / **skillAttach** / **rulesAttach**, **timeoutMs**. OSS model/provider come from **llm-config** nodes. Proprietary agents (Claude Code / Codex / Cursor) expose a static **model** dropdown. Static secret: **apiKey** (`CLI_AGENT_API_KEY`). Build agent images from `images/<slug>/Dockerfile` and ensure they are present on the Docker engine before runs.

## For developers

Package `@conveyor/plugin-cli-agent`, `pluginId` `cli-agent`. Sources live under `src/`. Build and test from `cli-agent`: `npm test`, then `npm run build`. Sidecar service `cli-agent` listens on TCP **9416** in `docker-compose.yml` and publishes the A2A hub on **9419**. The sidecar mounts `/var/run/docker.sock`. Workspace binds require `CLI_AGENT_WORKSPACE_ROOT`. Sample environment is `env.example`.

Folder and process bootstrap (after executors are published): `scripts/create-cli-agent-processes.mjs` and `docs/processes.md`.

Cell smoke against collection `chuk_i_gek` (one published-cell start per question, answers scored to the marked option): `npm run smoke:cell -w @conveyor/plugin-cli-agent`. Open-source agents use `gemma4:12b-mlx` via Ollama (`aider` uses `provider=custom` and `openai/gemma4:12b-mlx`). Proprietary agents take `SMOKE_MODEL_CLAUDE_CODE`, `SMOKE_MODEL_CODEX`, `SMOKE_MODEL_CURSOR`, and `SMOKE_MODEL_ZAI`. Live polls need `CONVEYOR_API_TOKEN`. Rows are written to `.smoke-chuk-gek/results.json`.

After a rebuild: disable and remove the plugin in the UI as an administrator, restart the sidecar, then enable it again as the workspace user. Confirm `publicationVersion` in the sidecar log and `plugin_publication_committed` for `cli-agent` in plugin-manager.
