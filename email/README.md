# @conveyor/plugin-email

Плагин отправляет **электронную почту** через SMTP из узлов процесса Conveyor.

## Назначение

Исходящие письма с HTML/plain text, опциональные вложения (путь на диске workspace, inline base64 или массив из upstream-узлов, например office xlsx). Параметры SMTP-сервера — static поля узла; пароль — ref.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `data.email.send` | Отправка электронной почты | SMTP send через nodemailer |

Справка — `src/send/help.md`.

## Конфигурация в редакторе

- Включите плагин **Email** в workspace.
- На узле: **host**, **port**, **secure**, **from** (static).
- **user** / **pass** (ref для пароля) — при необходимости AUTH.
- **to**, **subject**, **body**, вложения — порты или static.

## Для разработчика

**Пакет:** `@conveyor/plugin-email` · **pluginId:** `email`

**Структура:**

```
email/
  src/
    email-manifest.builder.ts
    email-batch.source.ts
    send/executor.ts
    send/mailer.service.ts
```

**Сборка:**

```bash
npm run build -w @conveyor/plugin-email
```

**Docker:** сервис `email` в [`docker-compose.yml`](../docker-compose.yml), порт **9410**. В demo-compose по умолчанию не поднимается — добавьте сервис по образцу `jira`.

**Внешние зависимости:** доступный SMTP-сервер из сети контейнера плагина.

**Файлы вложений:** пути относительно run-workspace runtime; inline base64 — из выходов других узлов (office, readBinary).
