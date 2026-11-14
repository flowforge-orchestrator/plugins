# Telegram: сообщение из истории

Одна запись локальной истории, полями на выходные порты.

## Параметры

- **ID** — ключ строки
- либо **Chat ID** и **Message ID** — самая поздняя запись этой пары

## Выходы

`id`, `chatId`, `messageId`, `updateId`, `direction`, `kind`, `text`, `fromId`, `fromUsername`, `fromFirstName`, `messageThreadId`, `replyToMessageId`, `replyToText`, `chatType`, `chatTitle`, `date`.

## Ошибки

Нет ни id, ни пары chat/message, или запись не найдена — шаг падает.
