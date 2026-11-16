# CLI LLM config

Один узел с endpoint-настройками LLM для всех CLI-агентов в процессе.

## Входы (статика)

| Name | Назначение |
| --- | --- |
| `provider` | openrouter / anthropic / openai / ollama / custom / … |
| `model` | id модели |
| `baseUrl` | OpenAI-compatible base (ollama/custom) |
| `apiKey` | секрет (`CLI_AGENT_API_KEY`) |

## Выходы

| Name | Описание |
| --- | --- |
| `llmConfig` | Opaque JSON для порта `llmConfig` CLI-агента |
| `status` | `ok` или `error: …` |

## Связка

`llm-config` → `llmConfig` → каждый `plugin.cli-agent.*`.

Агент берёт provider / model / baseUrl / apiKey из attach; локальные поля
на агенте не нужны, если порт `llmConfig` заполнен.
