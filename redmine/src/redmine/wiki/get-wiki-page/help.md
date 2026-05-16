# Redmine: получить wiki-страницу

Получает wiki-страницу проекта по имени.

## Параметры

- **Base URL** — адрес Redmine
- **API ключ** — X-Redmine-API-Key (ref)
- **Проект** — ID или identifier проекта
- **Страница** — имя wiki-страницы (например: UsersGuide или Wiki)
- **Include** — связанные данные: attachments

## Выходы

- **wikiPage** — данные страницы (title, text, version, ...)
- **status** — ok или описание ошибки
