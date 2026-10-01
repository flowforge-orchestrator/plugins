# RAG: ответ LLM

Генерирует ответ на вопрос пользователя **только** по переданному `context`
(обычно выход `plugin.rag.search.query`) и опциональной `history` диалога.
К векторному индексу и графу не ходит.

## Типовой граф чата

`system.trigger.input` → `plugin.rag.search.query` → `plugin.rag.answer` → `system.output`

Поля триггера: `query` (для поиска, можно обогатить follow-up), `message` (сырая реплика),
`history` (JSON `[{role,text}]`), `collectionId`, `topK`.

## Форма воркспейса

`:ff-plugin-form{plugin-id="rag" form-id="ask" diagram-id="…" public-portal-slug="…"}`
