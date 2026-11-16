## Purpose

Runs OpenAI Codex (`codex exec`) in a one-shot Docker container against **OpenAI/Codex cloud** with a model selected on this node. Does not use `--oss` / Ollama or shared llm-config models.

## Inputs

| Name | Type | Binding | Required |
| --- | --- | --- | --- |
| task | string | port | yes |
| model | select | static | yes — native Codex models (`gpt-6.1-sol`, `gpt-6-astra`, `o3`, …) → `codex -m` |
| llmConfig | string | port | optional — may supply `apiKey` only; provider/model/baseUrl from llm-config are ignored |
| provider / baseUrl | string | static | unused for routing (forced `openai`) |
| tools | string | port | must stay `[]` (CLI cannot filter tools) |
| skills | string | port | leave empty; empty disables `AGENTS.md` / skills usage |
| mcpAttach / skillAttach / rulesAttach | string | port | from providers |
| timeoutMs | number | port | default 10 min, max 30 min |
| apiKey | ref (`CLI_AGENT_API_KEY`) | static | OpenAI key (or via llmConfig credentials) |

## Outputs

`text`, `stdout`, `stderr`, `truncated`, `stdoutBytes`, `stderrBytes`, `exitCode`, `status` (`ok`/`error`/`unsupported`), `usageKnown`, `inputTokens`, `outputTokens`, `totalTokens`, `workspaceMounted`, `metricsJson`.

## Errors

- `unsupported` — missing apiKey/model, bad tools/skills JSON, or CLI cannot apply a non-empty tools/skills filter.
- `error` — container failure, non-zero exit, or timeout.

## Editor

Enable the `cli-agent` plugin. Pick a Codex model on the node. Do not expect shared Ollama/GigaChat llm-config to drive this agent.
