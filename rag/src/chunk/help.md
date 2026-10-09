# RAG: нарезать чанки

Иерархия **doc → section → paragraph → leaf (~400 символов)**. В векторный индекс уходят только листья (`level=chunk`); остальные уровни — узлы графа с `CONTAINS`.

## Зачем

Поиск может опираться на любой уровень иерархии; у листа сохраняется путь к разделу и абзацу через `parentId`.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Блоки** (`blocks`) | `textarea` | да | да | Блоки |
| **ID документа** (`docId`) | `string` | да | да | ID документа |
| **Стратегия** (`strategy`) | `select` | static | нет | recursive \| semantic |
| **Макс. символов листа** (`maxChars`) | `number` | static | нет | Целевой размер leaf (~400) |
| **Overlap символов** (`overlapChars`) | `number` | static | нет | Overlap между листьями |
| **Макс. токенов** (`maxTokens`) | `number` | static | нет | Legacy, если maxChars не задан (×4) |
| **Overlap токенов** (`overlapTokens`) | `number` | static | нет | Legacy overlap |
| **Жёсткий потолок** (`hardMaxTokens`) | `number` | static | нет | Жёсткий потолок (tokens) |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Чанки** (`chunks`) | `textarea` | Все уровни иерархии (`level`, `parentId`) |
| **Гистограмма длин** (`lengthHistogram`) | `keyvalue` | По листьям |
| **Доля пустых** (`emptyShare`) | `number` | Доля пустых |
| **Доля вынужденных разрезов** (`forcedCutShare`) | `number` | Доля вынужденных разрезов |
| **Число чанков** (`chunkCount`) | `number` | Число узлов (все уровни) |

## Ошибки

Пустые blocks; неверная стратегия нарезки.
