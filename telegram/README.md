# @conveyor/plugin-telegram

Плагин отправляет сообщения в **Telegram** через Bot API и регистрирует соответствующий узел в Conveyor.

## Назначение

Sidecar-процесс для уведомлений и исходящих сообщений в чаты и каналы: текст, опционально HTML/Markdown. Токен бота хранится как секрет (ref), chat ID и текст могут приходить с портов графа или из static полей узла.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `plugin.telegram.send` | Telegram: отправить сообщение | POST к Bot API; retry при временных ошибках |

Справка по полям — `src/telegram/send/help.md`.

## Конфигурация в редакторе

- Включите плагин **Telegram** в workspace.
- **Bot Token** — ref на секрет из Storage (static на узле).
- **Chat ID** и **текст** — порты или static; **parse mode** — опционально.

## Для разработчика

**Пакет:** `@conveyor/plugin-telegram` · **pluginId:** `telegram`

**Структура:**

```
telegram/
  src/
    telegram-manifest.builder.ts
    telegram-batch.source.ts
    telegram/send/send.executor.ts
```

**Сборка:**

```bash
npm run build -w @conveyor/plugin-telegram
```

**Docker:** сервис `telegram`, порт по умолчанию **9400**. Входит в demo-compose ([`compose.demo.yml`](../compose.demo.yml)).

**Env:** [`env.example`](env.example) — sidecar к demo (`PLUGIN_MANAGER_RPC_HOST=demo`) и external stack.

**Зависимости:** только HTTP к `api.telegram.org`; дополнительных сервисов на хосте не требуется.
