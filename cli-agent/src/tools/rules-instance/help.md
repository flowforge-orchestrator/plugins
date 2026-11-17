# CLI rules instance

Имя и тело правил → один opaque instance для RulesProvider.

## Входы

| Name | Назначение |
| --- | --- |
| `name` | `AGENTS.md` по умолчанию |
| `body` | Текст правил |

## Выходы

| Name | Описание |
| --- | --- |
| `instance` | Opaque JSON для входа RulesProvider |
| `status` | `ok` или `error: …` |

## Связка

`rules-instance` → динамический вход `rules-provider` → `rulesAttach` CLI-агента.
