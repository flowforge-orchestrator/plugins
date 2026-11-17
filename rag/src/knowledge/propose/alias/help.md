# RAG: предложить alias

Агентское предложение alias. Не пишет S2.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Вид** (`kind`) | `select` | да | да | entity \| concept |
| **Цель** (`targetId`) | `string` | да | да | Id сущности/понятия |
| **Alias** (`alias`) | `string` | да | да | Alias |
| **Evidence ID** (`evidenceId`) | `string` | да | нет | Evidence |
| **Span** (`span`) | `textarea` | да | нет | Span |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Proposal** (`proposal`) | `textarea` | Proposal candidate |
