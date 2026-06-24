# CalDAV: список календарей

Возвращает календари, доступные по указанным учётным данным.

## Подключение (static)

| Поле | Пример |
| --- | --- |
| **CalDAV URL** | `https://nextcloud.example.com/remote.php/dav` |
| **Логин** | `user@example.com` |
| **Пароль** | app-password (ref) |

## Выход

- **count** — число календарей
- **calendarsJson** — JSON, например:

```json
[
  {
    "url": "https://nextcloud.example.com/remote.php/dav/calendars/user/personal/",
    "name": "Личный"
  }
]
```

Используйте **url** или **name** в `listEvents` и `createEvent`.
