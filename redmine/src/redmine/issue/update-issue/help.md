# Redmine: обновить задачу

Обновляет issue по ID.

## Параметры

- **Base URL** — адрес Redmine
- **API ключ** — X-Redmine-API-Key (ref)
- **ID задачи** — ID issue в Redmine
- **Subject** — тема задачи
- **Описание** — описание
- **Статус** — status_id
- **Приоритет** — priority_id
- **Исполнитель** — assigned_to_id
- **Done ratio** — процент выполнения (0–100)
- **Notes** — комментарий к обновлению

## Выходы

- **issue** — обновлённая задача
- **status** — ok или описание ошибки
