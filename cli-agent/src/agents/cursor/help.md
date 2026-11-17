## Purpose

Runs the real Cursor Agent CLI (`agent -p`) in a one-shot Docker container against **Cursor cloud** with a model selected on this node. No HTTP `chat/completions` / Ollama bridge.

## Inputs

| Name | Type | Binding | Required |
| --- | --- | --- | --- |
| task | string | port | yes |
| model | select | static | yes — native Cursor models (`auto`, `composer-2.5`, `grok-4.7`, `gpt-5`, …) → `agent --model` |
| llmConfig | string | port | optional — may supply `apiKey` only; provider/model/baseUrl from llm-config are ignored |
| provider / baseUrl | string | static | unused for Ollama; non-local baseUrl may set `CURSOR_API_ENDPOINT` |
| tools | string | port | JSON array; non-empty may pass `--approve-mcps` |
| skills | string | port | leave empty |
| mcpAttach / skillAttach / rulesAttach | string | port | from providers |
| timeoutMs | number | port | default 10 min, max 30 min |
| apiKey | ref (`CLI_AGENT_API_KEY`) | static | `CURSOR_API_KEY` (or via llmConfig credentials) |

## Outputs

`text`, `stdout`, `stderr`, `truncated`, `stdoutBytes`, `stderrBytes`, `exitCode`, `status` (`ok`/`error`/`unsupported`), `usageKnown`, `inputTokens`, `outputTokens`, `totalTokens`, `workspaceMounted`, `metricsJson`.

## Errors

- `unsupported` — missing apiKey/model, bad tools/skills JSON, or CLI cannot apply a non-empty tools/skills filter.
- `error` — container failure, non-zero exit, or timeout (local Ollama names fail honestly on Cursor cloud).

## Editor

Enable the `cli-agent` plugin. Pick a Cursor model on the node. Real `agent` CLI only — never a local chat/completions substitute.
