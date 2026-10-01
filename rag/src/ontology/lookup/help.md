# RAG: lookup онтологии

Типы схемы и сущности, чьё имя содержит запрос целиком.

## Зачем

Агенту нужен срез схемы по запросу, не полный дамп онтологии.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | ID коллекции |
| **Запрос** (`query`) | `textarea` | да | да | Запрос |
| **Пропустить** (`skipRetrieval`) | `string` | да | нет | true/false string or boolean |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Action** (`action`) | `string` | да | нет | Action |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Ontology context** (`ontologyContext`) | `textarea` | Ontology context |
| **Matched entity ids** (`entityHits`) | `textarea` | Matched entity ids |
| **Observations** (`observations`) | `textarea` | Observations |
