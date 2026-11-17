# CLI rules provider

Собирает **динамический** набор RulesInstance в opaque `rulesAttach` для CLI-агента.

## Динамические входы

Каждый вход-порт — RulesInstance JSON (`plugin.cli-agent.rules-instance` → `instance`).
Имя `AGENTS` / `AGENTS.md` пишется в `/tmp/pack/AGENTS.md`.

## Выходы

| Name | Описание |
| --- | --- |
| `rulesAttach` | Opaque JSON для порта `rulesAttach` CLI-агента |
| `ruleNames` | JSON-массив имён |
| `status` | `ok` или `error: …` |

## Связка

`rules-instance` → (динамический вход) → `rulesAttach` → CLI agent.
