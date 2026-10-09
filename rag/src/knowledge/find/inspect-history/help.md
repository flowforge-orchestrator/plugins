# RAG: история claim

Все версии subject+predicate с alternatives и статусами.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | Коллекция |
| **Claims** (`claims`) | `textarea` | да | да | Полная история |
| **Субъект** (`subject`) | `string` | да | да | Subject |
| **Предикат** (`predicate`) | `string` | да | да | Predicate |
| **Лимит** (`limit`) | `number` | static | нет | Максимум |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Записи** (`records`) | `textarea` | Claim[] по времени |
| **Evidence IDs** (`evidenceIds`) | `textarea` | Evidence |
| **Альтернативы** (`alternatives`) | `textarea` | object/status/source |
