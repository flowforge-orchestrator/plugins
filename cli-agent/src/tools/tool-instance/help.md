# CLI tool instance

Связывает meta-описание тула и исходник JavaScript в один opaque instance для ToolProvider.

## Входы

| Name | Назначение |
| --- | --- |
| `meta` | `{ name, description, inputSchema }` |
| `source` | `async (input) => …` |
| `language` | Пока только `javascript` |

## Выходы

| Name | Описание |
| --- | --- |
| `instance` | Opaque JSON для входа ToolProvider |
| `status` | `ok` или `error: …` |

## Связка

`tool-instance` → динамический вход `tool-provider` → `mcpAttach` CLI-агента.
