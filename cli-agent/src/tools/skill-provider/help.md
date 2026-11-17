# CLI skill provider

Собирает **динамический** набор SkillInstance в opaque `skillAttach` для CLI-агента.

## Динамические входы

В каталоге нет фиксированных портов. Каждый вход-порт — SkillInstance JSON
(`plugin.cli-agent.skill-instance` → `instance`).

## Выходы

| Name | Описание |
| --- | --- |
| `skillAttach` | Opaque JSON для порта `skillAttach` CLI-агента |
| `skillNames` | JSON-массив имён |
| `status` | `ok` или `error: …` |

## Связка

`skill-instance` → (динамический вход) → `skillAttach` → CLI agent.

Агент материализует skills под `/tmp/pack/skills/<name>/SKILL.md` на время run.
