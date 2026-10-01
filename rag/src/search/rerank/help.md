# RAG: реранк

Отдельный шаг после `plugin.rag.search.query`: скорит кандидатов моделью (Ollama),
выбирает topK с лимитом чанков на документ (полнота по корпусу) и собирает `context`.

## Форма

В пресете `rag-chat`: search → **rerank** → answer.
