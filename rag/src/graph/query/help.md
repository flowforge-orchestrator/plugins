# RAG: обход графа

Параметризованный Cypher: окрестность сущности, узла или связи по имени целиком.

## Зачем

Окрестность сущности дополняет векторный поиск структурированными фактами.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | ID коллекции |
| **Имя узла или связи** (`query`) | `textarea` | да | да | Имя сущности, тип узла или тип связи. Не Cypher. |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Action** (`action`) | `string` | да | нет | Action |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Graph context** (`graphContext`) | `textarea` | Graph context |
| **Node count** (`nodeCount`) | `number` | Node count |
| **Observations** (`observations`) | `textarea` | Observations |
