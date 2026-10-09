# RAG: разрешить claim

Вход: ClaimCandidate и окно существующих claims. Выход: ClaimDecision. Параметр: допуск пересечения окон.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Кандидат** (`candidate`) | `textarea` | да | да | ClaimCandidate |
| **Существующие** (`existing`) | `textarea` | да | да | Окно существующих Claim |
| **Допуск окон (дни)** (`windowToleranceDays`) | `number` | static | нет | Допуск пересечения окон |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Решение** (`decision`) | `textarea` | ClaimDecision (`new` \| `duplicate` \| `conflict`) |
