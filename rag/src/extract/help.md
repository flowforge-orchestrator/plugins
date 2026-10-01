# RAG: извлечь документ

Приводит произвольный текст или URL к промежуточным блокам (`heading`, `paragraph`, `table`, `list`, `code`).

## Входы

| Поле | Тип | Порт | Описание |
|------|-----|------|----------|
| documentText | textarea | да | Текст / Markdown |
| documentUrl | string | опц. | HTTP(S) URL |
| docId | string | да | Стабильный id документа |

## Выходы

| Поле | Описание |
|------|----------|
| blocks | Массив блоков |
| pageCoverage | 0..1 |
| blockCount | Число блоков |

## Ошибки

Нет текста и URL; HTTP ошибка загрузки URL.

## Форма

`:ff-plugin-form{plugin-id="rag" form-id="index" diagram-id="…"}`
