# @conveyor/plugin-rag

**RAG по документам** — плагин Conveyor, который превращает файлы в отвечающий корпус: индексирует их в свой векторный индекс и граф знаний, ищет по ним и ведёт диалог, где ответ опирается на найденные фрагменты, а не на догадки модели.

## Назначение

Sidecar закрывает документный контур целиком. Ядру не нужно знать про эмбеддинги, чанки и граф — так же, как Telegram живёт рядом ради сообщений, этот плагин живёт рядом ради корпуса документов.

На выходе платформа видит узлы `plugin.rag.*`, workspace-формы (индекс, поиск, чат, статистика) и пресет `rag` с тремя процессами: индексация, поиск, чат. Хранилища **Qdrant** и **Neo4j** остаются в контуре плагина. Секреты LLM/эмбеддингов — node `ref` (`OPENAI_API_KEY`). URL сторов (`QDRANT_URL`, `NEO4J_URI`) и модели (`EMBEDDING_MODEL`, `LLM_MODEL`, …) приходят из env контейнера; манифестные `variables` отображаются на вкладке Plugins, но в v1 исполнители читают env.

Контур ответа: рамка вопроса → ход агента → предложение значений полей → claims → критик → судья → гард. Поле без подтверждённого фрагмента не считается ответом; нехватка данных закрывает цикл через `unresolvedQuestions`, а не через выдумку.

## Где лежит

| | |
| --- | --- |
| Пакет | [`rag/`](.) в репозитории `flowforge-orchestrator/plugins` |
| Соседи | Рядом с jira, telegram, llm, email и остальными sidecar-плагинами |
| Локальный стек со сторами | [`../compose.rag.yml`](../compose.rag.yml) + [`../compose.rag.env.example`](../compose.rag.env.example) |
| Внешнее ядро | сервис `rag` в [`../docker-compose.yml`](../docker-compose.yml) |

В quick-start [`../compose.demo.yml`](../compose.demo.yml) плагин **не** поднимается сам — его подключают отдельно, когда нужны документный индекс и ask-агент.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `plugin.rag.extract` | RAG: извлечь документ | Текст/URL → блоки документа |
| `plugin.rag.chunk` | RAG: нарезать чанки | Структурная нарезка |
| `plugin.rag.ontology.propose.entities` | RAG: предложить типы сущностей | Кандидаты типов из LLM |
| `plugin.rag.ontology.propose.relations` | RAG: предложить типы связей | Кандидаты связей из LLM |
| `plugin.rag.ontology.merge` | RAG: слить онтологию | Слияние схемы + версия |
| `plugin.rag.ontology.lookup` | RAG: lookup онтологии | Срез типов и сущностей по запросу |
| `plugin.rag.graph.query` | RAG: обход графа | Окрестность сущности/связи |
| `plugin.rag.graph.prepare` | RAG: инвентарь коллекции | Список документов коллекции |
| `plugin.rag.entity.extract` | RAG: извлечь упоминания | Упоминания в закрытой схеме |
| `plugin.rag.entity.resolve` | RAG: разрешить сущности | Канонические сущности |
| `plugin.rag.relation.extract` | RAG: извлечь связи | Связи с evidence |
| `plugin.rag.index.write` | RAG: записать индекс | Эмбеддинг + upsert вектор/граф |
| `plugin.rag.search.query` | RAG: поиск | Гибридный поиск; учитывает `skipRetrieval` |
| `plugin.rag.rerank` | RAG: реранк | LLM-реранк + разнообразие по документам |
| `plugin.rag.topic` | RAG: рамка вопроса | Охват, слоты, сущность, skipRetrieval |
| `plugin.rag.agent.plan` | RAG: стратегия | Выбор стратегии → порт `strategy` |
| `plugin.rag.provider.search` | RAG: провайдер поиска | Карточка поиска |
| `plugin.rag.provider.graph` | RAG: провайдер графа | Карточка графа |
| `plugin.rag.provider.ontology` | RAG: провайдер онтологии | Карточка онтологии |
| `plugin.rag.provider.prepare` | RAG: провайдер инвентаря | Карточка инвентаря |
| `plugin.rag.provider.topic` | RAG: провайдер рамки | Карточка рамки |
| `plugin.rag.provider.rerank` | RAG: провайдер реранка | Карточка реранка |
| `plugin.rag.provider.aggregate` | RAG: провайдер агрегации | Карточка агрегации |
| `plugin.rag.provider.calculate` | RAG: провайдер вычисления | Карточка вычисления |
| `plugin.rag.tool.router` | RAG: роутер инструментов | Карточки → вход `tools` хода |
| `plugin.rag.agent.turn` | RAG: ход агента | Одна операция на итерацию цикла |
| `plugin.rag.evidence.hits` | RAG: evidence из поиска | Хиты → observation evidence |
| `plugin.rag.evidence.inventory` | RAG: evidence из схемы | Инвентарь → evidence |
| `plugin.rag.evidence.text` | RAG: evidence из текста | Текст инструмента → evidence |
| `plugin.rag.evidence.merge` | RAG: объединить evidence | Слияние без дублей id |
| `plugin.rag.aggregate` | RAG: агрегировать | count/sum/min/max по evidence |
| `plugin.rag.calculate` | RAG: вычислить | add/sub/mul/div двух evidence |
| `plugin.rag.slot.propose` | RAG: значения полей | Дословный фрагмент на открытое поле |
| `plugin.rag.claims` | RAG: claims из предложений | Claim только при span внутри записи |
| `plugin.rag.slot.critic` | RAG: критик полей | Подтверждает, что фрагмент называет поле |
| `plugin.rag.judge` | RAG: судья | Код-проверка claims против evidence |
| `plugin.rag.guard` | RAG: гард цикла | `continueLoop` / ответ насквозь |
| `plugin.rag.synthesize` | RAG: синтез ответа | Ответ из supported claims и ограничений |
| `plugin.rag.safety` | RAG: проверка перед выдачей | Отсев необоснованных claims |
| `plugin.rag.answer` | RAG: ответ LLM | Тонкий генератор (линейный debug) |

Справка по полям — `help.md` рядом с каждым исполнителем (`src/**/help.md`).

## Конфигурация в редакторе

1. Включите плагин **RAG по документам** на вкладке Plugins.
2. Привяжите `ref`-секреты на полях LLM/эмбеддингов используемых узлов.
3. Задайте `collectionId` / `docId` / стратегию / `topK` static-полями или портами.
4. Импортируйте пресет `rag` (каталог preset-service) — папка из трёх процессов: index, search, chat.
5. Острова workspace:

```md
:ff-plugin-form{plugin-id="rag" form-id="index" diagram-id="…" refresh-interval="5000"}
:ff-plugin-form{plugin-id="rag" form-id="ask" diagram-id="…" refresh-interval="4000"}
:ff-plugin-form{plugin-id="rag" form-id="stats-pipeline" diagram-id="…" refresh-interval="8000"}
:ff-plugin-form{plugin-id="rag" form-id="stats-chat" diagram-id="…" refresh-interval="8000"}
```

Формы: `index`, `ask`, `search`, `stats-pipeline`, `stats-chat`.

### Чат (`rag-chat`)

Схема (`graph.prepare` → evidence) и рамка вопроса (`topic`) выполняются один раз, затем `system.loop`. Внутри цикла `system.control.switch` открывает одну ветку. `direct` пропускает observations и останавливается. `retrieval` / `analysis` / `research` делят ход агента. Хиты поиска — кандидаты, не значения полей. Цепочка `slot.propose` → `claims` → `slot.critic` → `judge` наполняет и проверяет контракт; решение досбора или сдачи поля принадлежит следующему ходу. Цикл закрывает `guard`, когда вердикт complete, конфликт явен или исчерпан `maxTurns`. После цикла `synthesize` пишет ответ, `safety` проверяет claims. Ход агента сам в Qdrant/Neo4j не ходит.

## Для разработчика

**Пакет:** `@conveyor/plugin-rag` · **pluginId:** `rag` · префикс узлов `plugin.rag.`

**Структура:**

```
rag/
  src/           исполнители, адаптеры, research/
  ui/            формы workspace
  presets/       rag.json, rag-chat.json, …
  scripts/       build-ui.mjs, build-rag-chat-loop.py
  env.example
```

**Сборка и тесты:**

```bash
npm run build -w @conveyor/plugin-rag
npm test -w @conveyor/plugin-rag
```

**Порты по умолчанию:** executor TCP **9406**, asset HTTP **9407**.

**Локальный стек со сторами** (demo уже поднят, сеть `flowforge-demo_default`, токены часто `key`/`key`):

```bash
docker compose -f compose.rag.yml --env-file compose.rag.env.example up -d --build
```

Ollama на хосте (`embeddinggemma:latest`, LLM и rerank из `compose.rag.env.example`); sidecar достучится через `host.docker.internal`.

**Обновление после пересборки:** (1) отключите и удалите плагин в UI под администратором → (2) перезапустите sidecar → (3) включите плагин под пользователем workspace. В логах sidecar — новый `publicationVersion`; в plugin-manager — `plugin_publication_committed` и `plugin_static_cached`.

**Ollama smoke** (хостовые Qdrant/Neo4j + модели):

```bash
RUN_OLLAMA_SMOKE=1 npm test -w @conveyor/plugin-rag -- ollama.smoke --runInBand
```
