# CalDAV: событие

Загружает одно событие по **URL объекта** на сервере.

## Подключение (static)

| Поле | Пример |
| --- | --- |
| **CalDAV URL** | `https://nextcloud.example.com/remote.php/dav` |
| **Логин** | `user@example.com` |
| **Пароль** | app-password (ref) |

## Параметры

| Поле | Пример |
| --- | --- |
| **URL события** | `https://nextcloud.example.com/remote.php/dav/calendars/user/personal/abc.ics` |

Берите **eventUrl** из выхода `listEvents` или `createEvent`.

## Выход

- **status** — `found` или `not_found`
- **eventJson** — JSON события (те же поля, что в `listEvents`) или пустая строка
