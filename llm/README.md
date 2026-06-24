# @conveyor/plugin-llm

Плагин вызывает **языковые и inference-модели** (OpenAI, Ollama, Hugging Face) и публикует узлы генерации в Conveyor.

## Назначение

Единый sidecar для LLM-сценариев в процессах: промпт + system instructions, выбор модели, structured outputs (текст, raw JSON, usage). Ключи и base URL задаются на узле; для Ollama в Docker demo по умолчанию используется `host.docker.internal:11434`.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `llm.openai.generate` | Обращение к OpenAI API | Chat/completions через OpenAI-compatible API |
| `llm.ollama.generate` | Ollama: генерация | Локальный или удалённый Ollama |
| `plugin.huggingface.inference` | Hugging Face: Inference | TTS, audio, image, video через Inference API (`@huggingface/inference`) |

Справка — `help.md` в каталогах `src/openai/generate/`, `src/ollama/generate/`, `src/huggingface/inference/`.

## Конфигурация в редакторе

- Включите плагин **LLM** в workspace.
- **OpenAI:** API key (ref), модель, prompt/user message на узле.
- **Ollama:** имя модели, опционально base URL (static).
- **Hugging Face:** token (ref), model id, inputs.

Секреты не попадают в manifest `variables` — только ref-поля узлов.

## Для разработчика

**Пакет:** `@conveyor/plugin-llm` · **pluginId:** `llm`

**Структура:**

```
llm/
  src/
    llm-manifest.builder.ts
    llm-batch.source.ts
    openai/generate/
    ollama/generate/
    huggingface/inference/
```

**Сборка:**

```bash
npm run build -w @conveyor/plugin-llm
```

**Docker:** сервис `llm`, executor TCP **9404** (manifest без `staticAssets` — отдельный HTTP-порт не нужен). В demo-compose для Ollama задан `OLLAMA_BASE_URL` и `extra_hosts: host.docker.internal`.

**Внешние зависимости:**

- OpenAI — доступ в интернет или свой gateway (`OPENAI_BASE_URL`).
- Ollama — процесс на хосте или в отдельном контейнере.
- Hugging Face — Inference API endpoint.

**Compose:** [`compose.demo.yml`](../compose.demo.yml) (demo) · [`docker-compose.yml`](../docker-compose.yml) (external stack).

**Заметки:** префиксы `nodeType` различаются (`llm.*` у OpenAI/Ollama, `plugin.huggingface.*` у HF). Env для sidecar — по образцу [`telegram/env.example`](../telegram/env.example); в demo для Ollama — `OLLAMA_BASE_URL` + `host.docker.internal`.
