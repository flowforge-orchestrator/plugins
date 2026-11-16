# RAG: предложить понятие

Агентское предложение понятия. Не пишет S2.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Имя** (`name`) | `string` | да | да | Имя |
| **Aliases** (`aliases`) | `textarea` | да | нет | Aliases |
| **Определение** (`definition`) | `textarea` | да | нет | Definition |
| **Evidence ID** (`evidenceId`) | `string` | да | нет | Evidence |
| **Span** (`span`) | `textarea` | да | нет | Span |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Proposal** (`proposal`) | `textarea` | Proposal candidate |
