# RAG: политика конфликта

Вход: пара claims. Выход: ConflictBranch и, при ambiguous, элемент очереди review.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Левый claim** (`left`) | `textarea` | да | да | Первый Claim |
| **Правый claim** (`right`) | `textarea` | да | да | Второй Claim |
| **Авторитетность источников** (`sourceAuthorityOrder`) | `textarea` | static | нет | Порядок источников (слабый → сильный) |
| **То же определение** (`sameDefinition`) | `boolean` | static | нет | Считать ли метрику той же |
| **Тот же период = overlap** (`samePeriodRequiresOverlap`) | `boolean` | static | нет | Период через пересечение окон |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Ветка** (`branch`) | `textarea` | ConflictBranch |
