# Redmine: список проектов

Получает список проектов (публичные и доступные пользователю).

## Параметры

- **Base URL** — адрес Redmine
- **API ключ** — X-Redmine-API-Key (ref)
- **Include** — связанные данные: trackers, issue_categories, enabled_modules

## Выходы

- **projects** — массив проектов
- **status** — ok или описание ошибки
