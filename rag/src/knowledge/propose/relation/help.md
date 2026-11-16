# RAG: предложить relation

Агентское предложение связи. Не пишет S2.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Тип** (`typeId`) | `string` | да | да | Тип связи |
| **От** (`fromEntityId`) | `string` | да | да | from entity |
| **К** (`toEntityId`) | `string` | да | да | to entity |
| **Evidence ID** (`evidenceId`) | `string` | да | нет | Evidence |
| **Span** (`span`) | `textarea` | да | нет | Span |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Proposal** (`proposal`) | `textarea` | Proposal candidate |
