# RAG: найти события

Чтение S2 events по запросу.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | Коллекция |
| **События** (`events`) | `textarea` | да | да | Записи |
| **Тип** (`typeId`) | `string` | да | нет | Фильтр typeId |
| **Окно** (`timeWindow`) | `textarea` | да | нет | `{ from, to }` |
| **Лимит** (`limit`) | `number` | static | нет | Максимум |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Записи** (`records`) | `textarea` | Event[] |
| **Evidence IDs** (`evidenceIds`) | `textarea` | Связанные evidence |
