# RAG: поиск

Гибридный поиск: dense + графовое соседство, RRF, сборка контекста.

## Зачем

Гибридный поиск — единственный вход корпуса в ask-контур.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Запрос** (`query`) | `textarea` | да | да | Запрос |
| **ID коллекции** (`collectionId`) | `string` | да | да | ID коллекции |
| **topK** (`topK`) | `number` | static | нет | topK |
| **Пропустить retrieval** (`skipRetrieval`) | `string` | да | нет | true/false string or boolean |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Action** (`action`) | `string` | да | нет | Action |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |
| **API ключ эмбеддингов** (`embeddingApiKey`) | `ref` | static | нет | API ключ эмбеддингов |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Хиты** (`hits`) | `textarea` | Хиты |
| **Контекст** (`context`) | `textarea` | Контекст |
| **Число хитов** (`hitCount`) | `number` | Число хитов |
| **Observations** (`observations`) | `textarea` | Observations |

## Ошибки

Пустой collectionId; стор недоступен.
