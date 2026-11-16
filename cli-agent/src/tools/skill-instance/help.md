# CLI skill instance

Имя и тело `SKILL.md` → один opaque instance для SkillProvider. Контент задаётся снаружи плагина.

## Входы

| Name | Назначение |
| --- | --- |
| `name` | Имя skill |
| `body` | Содержимое `SKILL.md` |

## Выходы

| Name | Описание |
| --- | --- |
| `instance` | Opaque JSON для входа SkillProvider |
| `status` | `ok` или `error: …` |

## Связка

`skill-instance` → динамический вход `skill-provider` → `skillAttach` CLI-агента.
