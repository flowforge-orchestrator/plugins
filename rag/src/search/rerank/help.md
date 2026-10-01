# RAG: реранк

Реранжирует кандидатов поиска (Ollama/LLM), расширяет покрытие по docId и собирает контекст для ответа.

## Зачем

Сырой topK нужно сузить и разнообразить по документам перед evidence.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Запрос** (`query`) | `textarea` | да | да | Запрос |
| **Кандидаты (hits)** (`hits`) | `textarea` | да | нет | JSON хитов; если пусто — из observations.hits |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Action** (`action`) | `string` | да | нет | Action |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |
| **topK после реранка** (`topK`) | `number` | static | нет | topK после реранка |
| **Макс. чанков на документ** (`maxPerDoc`) | `number` | static | нет | Макс. чанков на документ |
| **API ключ LLM / rerank** (`apiKey`) | `ref` | static | нет | API ключ LLM / rerank |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Хиты после реранка** (`hits`) | `textarea` | Хиты после реранка |
| **Контекст** (`context`) | `textarea` | Контекст |
| **Число хитов** (`hitCount`) | `number` | Число хитов |
| **Уникальных документов** (`docCount`) | `number` | Уникальных документов |
| **Observations** (`observations`) | `textarea` | Observations |
