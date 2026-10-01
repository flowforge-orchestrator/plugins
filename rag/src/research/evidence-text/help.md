# RAG: evidence из текста

Один текст инструмента становится одной observation evidence.

## Зачем

Текстовый ответ инструмента нужно оформить той же моделью evidence.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Content** (`content`) | `textarea` | да | нет | Content |
| **Id** (`id`) | `string` | да | нет | Id |
| **Source** (`source`) | `string` | static | нет | Source |
| **Location** (`location`) | `string` | да | нет | Location |
| **Method** (`extractionMethod`) | `string` | static | нет | Method |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Evidence** (`evidence`) | `textarea` | Evidence |
