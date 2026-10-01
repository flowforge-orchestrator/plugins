# RAG: инвентарь коллекции

Каждый документ коллекции из графа: docId и заголовок первого чанка. Текст не разбирается.

## Зачем

Инвентарь коллекции показывает, какие документы вообще есть, без чтения текста.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **ID коллекции** (`collectionId`) | `string` | да | да | ID коллекции |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Action** (`action`) | `string` | да | нет | Action |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Инвентарь** (`inventory`) | `textarea` | Инвентарь |
| **Документов** (`docCount`) | `number` | Документов |
| **Observations** (`observations`) | `textarea` | Observations |
