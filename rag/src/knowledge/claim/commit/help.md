# RAG: зафиксировать claim

Вход: кандидат плюс decision/branch. Выход: Claim и статус. Повтор proposal возвращает существующий id. Запись append-only. При `collectionId` читает/пишет durable store под `RAG_DATA_DIR` (`claims.json`); без него — только порт `existing` (временно для изолированных прогонов).

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Кандидат** (`candidate`) | `textarea` | да | да | ClaimCandidate |
| **Решение** (`decision`) | `textarea` | да | да | ClaimDecision |
| **Ветка** (`branch`) | `textarea` | да | нет | ConflictBranch |
| **Существующие** (`existing`) | `textarea` | да | нет | Доп. Claim (мержится со store при `collectionId`) |
| **ID коллекции** (`collectionId`) | `string` | да | нет | Коллекция для durable S2 |
| **Источник** (`source`) | `string` | да | нет | Источник фиксации |
| **Утверждено** (`assertedAt`) | `string` | да | нет | ISO assertedAt |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Claim** (`claim`) | `textarea` | Зафиксированный Claim |
| **Обновления статусов** (`statusUpdates`) | `textarea` | Предыдущие claim со сменой статуса |
| **Повтор** (`reused`) | `boolean` | true, если proposal уже был |
