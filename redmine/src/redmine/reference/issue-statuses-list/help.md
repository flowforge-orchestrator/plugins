# Redmine: список статусов

Получает список статусов задач (New, In Progress, Closed и т.д.) из Redmine.

## Параметры

- **Base URL** — адрес Redmine (например: `https://redmine.example.com`)
- **API ключ** — X-Redmine-API-Key (ref на секрет)

## Выходы

- **issueStatuses** — массив статусов с id, name, is_closed
- **status** — ok или описание ошибки
