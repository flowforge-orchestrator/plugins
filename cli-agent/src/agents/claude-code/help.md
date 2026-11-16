## Purpose

Runs Claude Code (`claude -p`) in a one-shot Docker container against **Anthropic cloud** with a model selected on this node. Does not use shared llm-config ollama/gigachat models.

## Inputs

| Name | Type | Binding | Required |
| --- | --- | --- | --- |
| task | string | port | yes |
| model | select | static | yes — native Claude Code models (`sonnet`, `opus`, `haiku`, `fable`, `claude-sonnet-4-5`, …) → `claude --model` |
| llmConfig | string | port | optional — may supply `apiKey` only; provider/model/baseUrl from llm-config are ignored |
| provider / baseUrl | string | static | unused for routing (forced `anthropic`) |
| tools | string | port | JSON array of built-in tool names; empty `[]` = no tools (`--tools ""`) |
| skills | string | port | leave empty; use skillAttach |
| mcpAttach / skillAttach / rulesAttach | string | port | from providers |
| timeoutMs | number | port | default 10 min, max 30 min |
| apiKey | ref (`CLI_AGENT_API_KEY`) | static | Anthropic key (or via llmConfig credentials) |

## Outputs

`text`, `stdout`, `stderr`, `truncated`, `stdoutBytes`, `stderrBytes`, `exitCode`, `status` (`ok`/`error`/`unsupported`), `usageKnown`, `inputTokens`, `outputTokens`, `totalTokens`, `workspaceMounted`, `metricsJson`.

## Errors

- `unsupported` — missing apiKey/model, bad tools/skills JSON, or CLI cannot apply a non-empty tools/skills filter.
- `error` — container failure, non-zero exit, or timeout.

## Editor

Enable the `cli-agent` plugin. Pick a Claude model on the node. Wire `llmConfig` only if you want shared credential delivery; it must not point proprietary runs at Ollama.
