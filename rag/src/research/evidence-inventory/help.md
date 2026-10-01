# RAG: evidence из схемы

Каждый документ инвентаря — observation evidence. Текст документа не читается.

## Зачем

Список документов коллекции становится evidence без чтения содержимого.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Inventory** (`inventory`) | `textarea` | да | нет | Inventory |
| **Source** (`source`) | `string` | static | нет | Source |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Evidence** (`evidence`) | `textarea` | Evidence |
