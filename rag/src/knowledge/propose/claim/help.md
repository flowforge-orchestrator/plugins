# RAG: предложить claim

Агентское предложение claim. Не пишет S2; статус candidate.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Субъект** (`subject`) | `string` | да | да | Subject |
| **Предикат** (`predicate`) | `string` | да | да | Predicate |
| **Объект** (`object`) | `string` | да | да | Object |
| **Evidence ID** (`evidenceId`) | `string` | да | нет | Evidence |
| **Span** (`span`) | `textarea` | да | нет | Span в тексте |
| **validFrom** (`validFrom`) | `string` | да | нет | Начало окна |
| **validTo** (`validTo`) | `string` | да | нет | Конец окна |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Proposal** (`proposal`) | `textarea` | Proposal candidate |
