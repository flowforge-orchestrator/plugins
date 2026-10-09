# RAG: разрешить понятие

Вход: ConceptCandidate (имя, aliases, definition). Выход: ConceptDecision и id понятия.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Кандидат** (`candidate`) | `textarea` | да | да | ConceptCandidate |
| **Существующие** (`existing`) | `textarea` | да | да | Известные понятия |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Решение** (`decision`) | `textarea` | ConceptDecision |
| **ID понятия** (`conceptId`) | `string` | Id понятия |
