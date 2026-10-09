# RAG: найти claims

Чтение S2 claims по запросу. Параметры: окно времени, лимит, collectionId.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | Коллекция |
| **Claims** (`claims`) | `textarea` | да | да | Записи для фильтрации |
| **Субъект** (`subject`) | `string` | да | нет | Фильтр subject |
| **Предикат** (`predicate`) | `string` | да | нет | Фильтр predicate |
| **Окно** (`timeWindow`) | `textarea` | да | нет | `{ from, to }` |
| **Лимит** (`limit`) | `number` | static | нет | Максимум записей |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Записи** (`records`) | `textarea` | Claim[] |
| **Evidence IDs** (`evidenceIds`) | `textarea` | Связанные evidence |
