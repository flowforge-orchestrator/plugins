# OpenAI: генерация

Вызывает OpenAI Responses API для генерации текста.

## Параметры

- **Системный промпт** — инструкции для модели (роль, стиль, ограничения)
- **Пользовательский промпт** — основной запрос к модели
- **Модель** — gpt-4o-mini или gpt-4o
- **API ключ** — ключ доступа к OpenAI API (ref на секрет)

## Выходы

- **text** — сгенерированный текст
- **raw** — полный raw-ответ API
- **model** — использованная модель
- **finishReason** — stop, length, content_filter и т.д.
- **usage** — inputTokens, outputTokens, totalTokens
