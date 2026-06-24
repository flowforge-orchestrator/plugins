# @conveyor/plugin-caldav

Универсальная интеграция с **CalDAV** (Nextcloud, iCloud, Radicale и др.): календари и CRUD событий.

## Назначение

Плагин даёт узлы для чтения календарей, выборки событий за период и создания/изменения/удаления VEVENT. Подключение к серверу — URL, логин и пароль (ref) в static полях каждого узла; отдельных переменных плагина нет.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `plugin.caldav.listCalendars` | CalDAV: список календарей | Доступные календари учётной записи |
| `plugin.caldav.listEvents` | CalDAV: список событий | События, пересекающиеся с интервалом |
| `plugin.caldav.getEvent` | CalDAV: событие | Одно событие по `eventUrl` |
| `plugin.caldav.createEvent` | CalDAV: создать событие | Новый VEVENT в календаре |
| `plugin.caldav.updateEvent` | CalDAV: изменить событие | PATCH по `eventUrl` |
| `plugin.caldav.deleteEvent` | CalDAV: удалить событие | DELETE по `eventUrl` |

Справка — `help.md` в подкаталогах `src/caldav/*/`.

## Конфигурация в редакторе

- Включите плагин **CalDAV** в workspace.
- На каждом узле: **CalDAV URL**, **логин**, **пароль** (ref → Storage).
- Для list/create — опционально URL или имя календаря из `listCalendars`.

## Для разработчика

**Пакет:** `@conveyor/plugin-caldav` · **pluginId:** `caldav`

**Стек:** `tsdav` (DAV client), `ical.js` (ICS parse/build).

**Структура:**

```
caldav/
  src/
    caldav-manifest.builder.ts
    caldav-batch.source.ts
    caldav/caldav-client.ts
    caldav/resolve-caldav-config.ts
    caldav/{list-calendars,list-events,...}/executor.ts
```

**Сборка и тесты:**

```bash
npm run build -w @conveyor/plugin-caldav
npm test -w @conveyor/plugin-caldav
```

**Docker:** сервис `caldav`, порт **9413**. Env — [`env.example`](env.example).

**Заметки:** connection fields дублируются в DTO каждого executor'а (metadata для UI); общая логика — `resolveCaldavConfig()` + `CaldavClient`.
