# Redmine: список wiki-страниц

Получает список всех wiki-страниц проекта.

## Параметры

- **Base URL** — адрес Redmine
- **API ключ** — X-Redmine-API-Key (ref)
- **Проект** — ID или identifier проекта (например: 1 или redmine)

## Выходы

- **wikiPages** — массив страниц (title, version, created_on, updated_on)
- **status** — ok или описание ошибки
