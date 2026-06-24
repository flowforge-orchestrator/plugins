# CalDAV: список событий

Загружает события, **пересекающиеся** с заданным интервалом времени.

## Подключение (static)

| Поле | Пример |
| --- | --- |
| **CalDAV URL** | `https://nextcloud.example.com/remote.php/dav` |
| **Логин** | `user@example.com` |
| **Пароль** | app-password или пароль учётки (ref) |

## Параметры шага

| Поле | Пример | Описание |
| --- | --- | --- |
| **Начало периода** | `2026-06-01T00:00:00+03:00` | ISO-8601 |
| **Конец периода** | `2026-06-30T23:59:59+03:00` | ISO-8601 |
| **URL календаря** | `https://nextcloud.example.com/remote.php/dav/calendars/user/personal/` | Опционально; `url` из `listCalendars` |
| **Имя календаря** | `Личный` | Опционально; если URL не задан |

Если оба поля календаря пусты — опрос **всех** доступных календарей.

## Выход

- **count** — число событий
- **eventsJson** — JSON-массив, например:

```json
[
  {
    "uid": "abc@flowforge",
    "summary": "Встреча",
    "calendarName": "Личный",
    "calendarUrl": "https://nextcloud.example.com/remote.php/dav/calendars/user/personal/",
    "eventUrl": "https://nextcloud.example.com/remote.php/dav/calendars/user/personal/abc.ics",
    "startDate": "2026-06-04T10:00:00+03:00",
    "endDate": "2026-06-04T11:00:00+03:00",
    "allDay": false
  }
]
```

Для `getEvent` / `updateEvent` / `deleteEvent` сохраняйте **eventUrl**.
