# Redmine: создать задачу

Создаёт issue в Redmine по REST API.

## Параметры

- **Base URL** — адрес Redmine
- **API ключ** — X-Redmine-API-Key (ref)
- **ID проекта** — project_id в Redmine
- **Тема** — subject задачи (обязательно)
- **Описание** — описание задачи
- **Трекер** — tracker_id (опционально)
- **Приоритет** — priority_id
- **Статус** — status_id
- **Исполнитель** — assigned_to_id

## Выходы

- **issue** — созданная задача (id, subject, ...)
- **id** — ID созданной задачи
- **status** — ok или описание ошибки
