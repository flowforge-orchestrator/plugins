# ADR: CLI-агенты как взаимозаменяемые процессы

## Status

Accepted.

## Context

Нужна папка процессов с одинаковым контрактом. Каждый процесс запускает своего CLI-агента с задачей, провайдером, инструментами и скиллами. Вызов одного процесса заменяется вызовом другого через `system.process.call`: порты берутся из `system.trigger.input` / `system.output` выбранной диаграммы.

Исполнители публикуются плагином и помечаются тегом `cli-agent` (так теги уже задаются в `@Executor`).

Провайдер `custom` повторяет OpenAI-совместимый вызов: вид `openai-compatible` — это `baseUrl` + ключ + модель. В контракте агента значение провайдера пишется строкой `custom`.

Узел `plugin.execution.container` для этого не подходит. Его профиль: сеть `none`, без томов, память 256m, таймаут до 30 с. Агенту нужен исходящий доступ к API и опциональный каталог работы. Паттерн клиента Docker Engine (`/var/run/docker.sock`, `clipOutput`) берётся оттуда и копируется в плагин, без импорта пакета `execution`.

Тело ответа API ограничено `PAYLOAD_LIMIT` (в примере `50mb`). Потоки агента в порты целиком не кладутся.

## Decision

### Контракт

Один `InputDto` и один `OutputDto` на все исполнители. Тег каждого: `cli-agent`. `nodeType`: `plugin.cli-agent.<slug>`.

Порты входа, они же выходы триггера процесса:

- `task` — строка, обязательна
- `provider` — строка, обязательна. Именованные: `openrouter`, `anthropic`, `openai`, `zai`, `nous`, `google`, `ollama`. Плюс `custom`
- `model` — строка
- `baseUrl` — строка. При `provider=custom` обязательна. Для именованного провайдера пустая строка означает известный этому CLI адрес
- `tools` — строка, JSON-массив имён. Пустая строка — набор CLI по умолчанию
- `skills` — строка, JSON-массив имён или путей. Пустая строка — набор по умолчанию
- `workspace` — строка, каталог на хосте под корнем плагина. Пустая строка — том не монтируется
- `timeoutMs` — число

Ключ API — статическое поле `apiKey` типа `ref`, `secretKind`: `CLI_AGENT_API_KEY`. В контракт процесса не входит, чтобы замена `diagramId` не требовала другого секрета на вызывающей стороне.

Порты выхода, они же входы `system.output`:

- `text`, `stdout`, `stderr` — строки после усечения
- `truncated` — истина, если чтение потока упёрлось в потолок или порт усечён
- `stdoutBytes`, `stderrBytes` — число прочитанных байт до потолка, не оценка полного вывода CLI
- `exitCode`
- `status` — `ok`, `error`, `unsupported`
- `usageKnown` — истина только если машинный вывод этого CLI содержит учёт токенов
- `inputTokens`, `outputTokens`, `totalTokens` — числа при `usageKnown`, иначе поля пустые
- `workspaceMounted`

`keyvalue` в контракте процесса нет: `process-output` отдаёт именованные порты.

`custom` с пустым `baseUrl`, неразобранный JSON в `tools`/`skills`, или каталог вне корня дают `status=unsupported` и контейнер не создаётся. Если CLI не умеет сузить инструменты или скиллы, а строка непустая — тот же `unsupported`, а не тихий запуск с полным набором.

Токены из длины текста не выводятся. Файлы, записанные в `/workspace`, в порты не копируются.

### Контейнер

На каждый вызов — новый контейнер, затем удаление. Образ задаёт адаптер, не вход процесса. Хост плагина содержит Docker socket (`DOCKER_SOCKET`, как у execution), не бинарники агентов.

Профиль:

- root только для чтения, `cap-drop ALL`, `no-new-privileges`, лимит PID
- память 2g, CPU не закрепляется в первой поставке
- сеть — исходящий bridge, порты наружу не публикуются, `host` network и socket внутрь контейнера не попадают
- домашний каталог CLI — tmpfs; ключ и `baseUrl` только в env этого запуска
- `workspace` монтируется единственным томом в `/workspace`, если путь после нормализации лежит под `CLI_AGENT_WORKSPACE_ROOT`
- таймаут: по умолчанию 10 мин, жёсткий потолок 30 мин, минимум 1 с. По истечении контейнер уничтожается, `status=error`, уже прочитанный кусок учитывается

Чтение логов: не больше 256 000 байт на поток. В порт строки попадает не больше 64 000 символов (тот же порядок, что `OUTPUT_MAX_CHARS` у execution). Не-UTF8 заменяется, `truncated=true`.

### Код

Плагин `@conveyor/plugin-cli-agent`, `pluginId` `cli-agent`, каталог `plugins/cli-agent`. Подключение в `workspaces` `plugins/package.json`.

- `src/contract/cli-agent.io.ts` — общие DTO
- `src/runtime/spawn.ts` — клиент Docker, потолки, учёт байт
- `src/runtime/workspace-path.ts` — проверка корня
- `src/agents/<slug>/adapter.ts` — argv и env из контракта, разбор usage из машинного вывода
- `src/agents/<slug>/executor.ts` — тонкий `@Executor`, общий `execute`
- `src/agents/registry.ts` — список адаптеров; новый агент — новый файл и одна строка реестра
- `images/<slug>/Dockerfile` — CLI внутри образа, тег зафиксирован в адаптере

Юнит-тесты на чистых функциях (`node --test`, как в execution): argv, `custom` без `baseUrl`, путь вне корня, усечение и байты, usage только из фикстуры вывода. Живой Docker в этих тестах не вызывается; runner подменяется.

### Процессы

Папка каталога `CLI agents` создаётся через folder API (`FolderService.create` / `POST /workspace-catalog/folders`). Process Builder папки не создаёт. Затем на каждого агента: `process_create` с `folderId`, граф `system.trigger.input` → `plugin.cli-agent.<slug>` → `system.output` с одинаковыми именами портов, триггеры `manual` и `mcp_tool` (`cli_agent_<slug>`), `process_validate`, `process_publish`.

Процессы создаются после того, как исполнители есть в библиотеке: `process_apply` принимает только известный `nodeType`.

### Каталог

Волна A (образы и процессы в первой поставке): Hermes (`hermes`), Claude Code (`claude -p`), Codex (`codex exec`), Cursor (print-режим CLI), Aider, OpenCode (`opencode run`), Z.ai (`zcode --prompt`).

Волна B, тот же контракт, после `--help` в образе: Kilo, OpenClaw, Cline, pi (pi.dev), OpenHands, omp, goose, Crush, Qwen Code, Junie.

Волна C — тот же контракт, адаптер только после найденной headless-команды: Strix, Proto Agent, Letta, CodeGPT, Digen, Trenzel, Rayline, JONI, mimocode, isdlc, Ante, Traycer, Kern, Nemo, pi-openrouter-plus (отдельный slug, не второй `pi`), V12X, JiuwenSwarm, hax, PostQode, Codewhale, Minara, Ekko Studio, PenguinHarness, Vellum, AtomCode, Gajae-Code, AILANG.

В каталог не входят StakeBetApp, folk, Hermes Web UI, OpenConfig. Cursor из рейтинга и Cursor CLI — один slug `cursor`.

## Consequences

- Замена агента на вызывающей диаграмме — смена `diagramId` у `system.process.call`. Порты не меняются.
- Сайдкар `cli-agent` монтирует Docker socket. Образы собираются отдельно и должны быть на движке до вызова.
- `plugin.execution.container` остаётся для произвольного образа без сети и без тома.
- Первая поставка — ядро, семь образов и семь процессов волны A. Волны B и C не меняют DTO.
- Живой каталог волн и статусов headless: `plugins/cli-agent/catalog/waves.json`. Scaffold волны B: `scripts/scaffold-wave-b.mjs`.
- Лендинг, публичные docs и cut-release в эту поставку не входят.
- Учёт токенов пустой, пока конкретный CLI не пишет usage в машинный вывод. Это видно по `usageKnown=false`.
