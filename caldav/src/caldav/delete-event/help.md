# CalDAV: удалить событие

Удаляет объект календаря по **eventUrl**.

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

## Выход

- **status** — `deleted`
