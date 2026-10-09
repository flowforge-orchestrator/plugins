# RAG: поиск

Сначала сущности из вопроса (и `frame.entity` из topic), затем выборка из графа по `DISCUSSED_IN` / соседству — **приоритетнее** dense. Dense дополняет пулы. В контексте хита: сущности чанка, связи и пересечение с интентом.

## Зачем

Простая выборка по сущностям вопроса из графа обычно ценнее векторно-близкого, но нерелевантного по смыслу куска.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Запрос** (`query`) | `textarea` | да | да | Запрос |
| **ID коллекции** (`collectionId`) | `string` | да | да | ID коллекции |
| **topK** (`topK`) | `number` | static | нет | topK |
| **Пропустить retrieval** (`skipRetrieval`) | `string` | да | нет | true/false string or boolean |
| **Observations** (`observations`) | `textarea` | да | нет | Observations (frame / prior hits) |
| **Action** (`action`) | `string` | да | нет | Action |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |
| **API ключ эмбеддингов** (`embeddingApiKey`) | `ref` | static | нет | API ключ эмбеддингов |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Хиты** (`hits`) | `textarea` | Хиты (+ entities / relations / intentOverlap) |
| **Контекст** (`context`) | `textarea` | Контекст |
| **Число хитов** (`hitCount`) | `number` | Число хитов |
| **Observations** (`observations`) | `textarea` | Observations |

## Ошибки

Пустой collectionId; стор недоступен.
