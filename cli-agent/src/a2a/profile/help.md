# CLI agent profile (A2A)

Одна роль команды для `plugin.cli-agent.factory`: какой CLI-агент её исполняет, чем он занимается и какие у него инструменты, скиллы и правила.

## Входы

| Name | Назначение |
| --- | --- |
| `name` | Имя роли; оркестратор передаёт его в `a2a_spawn` как `agent` |
| `agent` | slug CLI-агента с MCP-клиентом |
| `description` | Специализация; попадает в список ролей оркестратора и в промпт самого агента |
| `model` | Модель для Cursor / Codex / Claude Code |
| `llmConfig` | LLM роли; пусто — `llmConfig` фабрики |
| `mcpAttach`, `skillAttach`, `rulesAttach` | Инструменты, скиллы и правила только этой роли; attach фабрики роль не получает |
| `profiles` | Выход `profiles` предыдущего профиля |

## Выходы

| Name | Описание |
| --- | --- |
| `profiles` | JSON-массив профилей: цепочка до этого узла плюс он сам |
| `status` | `ok` или `error: …` (неверное имя, повтор имени) |

## Связка

`profile A.profiles` → `profile B.profiles` → … → `factory.profiles`
