# Redmine: получить задачу

Получает issue по ID через REST API.

## Параметры

- **Base URL** — адрес Redmine
- **API ключ** — X-Redmine-API-Key (ref)
- **ID задачи** — ID issue в Redmine
- **Include** — связанные данные: journals, attachments, relations, watchers

## Выходы

- **issue** — данные задачи
- **status** — ok или описание ошибки
