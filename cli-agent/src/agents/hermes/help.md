## Purpose

Runs this CLI coding agent in a one-shot Docker container and returns truncated stdout/stderr plus optional usage.

## Inputs

| Name | Type | Binding | Required |
| --- | --- | --- | --- |
| task | string | port | yes |
| provider | string | port | yes (`openrouter`, `anthropic`, `openai`, `zai`, `nous`, `google`, `ollama`, `custom`) |
| model | string | port | no |
| baseUrl | string | port | required when provider=`custom` |
| tools | string | port | JSON array of names; empty = CLI defaults |
| skills | string | port | JSON array of names/paths; empty = CLI defaults |
| workspace | string | port | host path under `CLI_AGENT_WORKSPACE_ROOT`; empty = no mount |
| timeoutMs | number | port | default 10 min, max 30 min |
| apiKey | ref (`CLI_AGENT_API_KEY`) | static | yes |

## Outputs

`text`, `stdout`, `stderr`, `truncated`, `stdoutBytes`, `stderrBytes`, `exitCode`, `status` (`ok`/`error`/`unsupported`), `usageKnown`, `inputTokens`, `outputTokens`, `totalTokens`, `workspaceMounted`.

## Errors

- `unsupported` — custom without baseUrl, bad tools/skills JSON, workspace outside root, or CLI cannot apply a non-empty tools/skills filter.
- `error` — container failure, non-zero exit, or timeout (container destroyed; partial streams kept).

## Editor

Enable the `cli-agent` plugin. Set `apiKey` as a workspace secret. Wire process ports identically across Wave A agents so `system.process.call` can swap `diagramId`.

