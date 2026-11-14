# @conveyor/plugin-telegram

Плагин отправляет сообщения в **Telegram** через Bot API и регистрирует соответствующий узел в Conveyor.

## Назначение

Sidecar-процесс для уведомлений и исходящих сообщений в чаты и каналы: текст, опционально HTML/Markdown. Токен бота хранится как секрет (ref), chat ID и текст могут приходить с портов графа или из static полей узла.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `plugin.telegram.send` | Telegram: отправить сообщение | POST к Bot API; retry при временных ошибках |
| `plugin.telegram.history.append` | Telegram: записать историю | Одна запись в локальный SQLite. Повтор `updateId` не дублирует строку |
| `plugin.telegram.history.list` | Telegram: список сообщений | Страница истории: фильтры по полям, диапазон дат, offset, limit |
| `plugin.telegram.history.get` | Telegram: сообщение из истории | Одна запись по `id` или по `chatId` + `messageId` |
| `plugin.telegram.history.chats` | Telegram: список чатов | Чаты из истории: последнее сообщение и число записей |

Справка по полям — `help.md` рядом с исполнителем. История не ходит в Bot API: у бота нет метода «прочитать переписку». После входящего апдейта и после исходящей отправки граф сам вызывает `history.append`. `history.list` с `chatId` и `order=oldest` отдаёт контекст беседы.

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
    telegram/history/          запись, список, одна запись, чаты
```

**Сборка:**

```bash
npm run build -w @conveyor/plugin-telegram
```

**Docker:** сервис `telegram`, порт по умолчанию **9400**. Входит в demo-compose ([`compose.demo.yml`](../compose.demo.yml)).

**Env:** [`env.example`](env.example) — sidecar к demo (`PLUGIN_MANAGER_RPC_HOST=demo`) и external stack.

**Зависимости:** HTTP к `api.telegram.org` для отправки. История — файл SQLite, `node:sqlite`, путь `TELEGRAM_HISTORY_PATH` (по умолчанию `~/.conveyor/telegram-history.sqlite`).

**Тесты:** `npm test -w @conveyor/plugin-telegram`

**Пресеты:**

- [`presets/telegram-incoming.json`](presets/telegram-incoming.json) — вебхук входящего апдейта: разбор `message`, правки и поста канала, запись в историю, ответ в тот же чат.
- [`presets/telegram-article.json`](presets/telegram-article.json) — три процесса: контент-план, создание статьи, публикация в канал.
