# Telegram: отправить сообщение

Отправляет сообщение в чат или канал через Telegram Bot API.

## Параметры

- **Bot Token** — токен от @BotFather (ref на секрет)
- **Chat ID** — ID чата или канала (@channel или -1001234567890)
- **Текст** — сообщение для отправки
- **Parse Mode** — HTML, Markdown или MarkdownV2 (опционально)

## Выходы

- **result** — ответ API (message_id, chat и т.д.)
- **status** — ok или описание ошибки
