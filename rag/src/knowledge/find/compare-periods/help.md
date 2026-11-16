# RAG: сравнить периоды

Два окна времени полями; оба набора claims на выходе.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | Коллекция |
| **Claims** (`claims`) | `textarea` | да | да | Записи |
| **Субъект** (`subject`) | `string` | да | нет | Фильтр |
| **Предикат** (`predicate`) | `string` | да | нет | Фильтр |
| **Окно A** (`windowA`) | `textarea` | да | да | `{ from, to }` |
| **Окно B** (`windowB`) | `textarea` | да | да | `{ from, to }` |
| **Лимит** (`limit`) | `number` | static | нет | Максимум на окно |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Период A** (`periodA`) | `textarea` | Claim[] |
| **Период B** (`periodB`) | `textarea` | Claim[] |
| **Evidence IDs** (`evidenceIds`) | `textarea` | Объединённые evidence |
