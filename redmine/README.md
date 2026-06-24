# @conveyor/plugin-redmine

Плагин интегрируется с **Redmine REST API**: задачи, wiki и справочники.

## Назначение

CRUD по issues, чтение и обновление wiki-страниц, списки проектов, трекеров и статусов для построения форм и ветвлений в процессе. Base URL и API key — на узле (key через ref); project id и поля задач — порты или static.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `plugin.redmine.issue.list` | Redmine: список задач | Фильтрация списка issues |
| `plugin.redmine.issue.get` | Redmine: получить задачу | Issue по id |
| `plugin.redmine.issue.create` | Redmine: создать задачу | Новая issue в проекте |
| `plugin.redmine.issue.update` | Redmine: обновить задачу | PATCH полей issue |
| `plugin.redmine.wiki.list` | Redmine: список wiki-страниц | Страницы wiki проекта |
| `plugin.redmine.wiki.get` | Redmine: получить wiki-страницу | Контент страницы |
| `plugin.redmine.wiki.update` | Redmine: обновить wiki-страницу | Обновление wiki |
| `plugin.redmine.projects.list` | Redmine: список проектов | Справочник проектов |
| `plugin.redmine.trackers.list` | Redmine: список трекеров | Справочник трекеров |
| `plugin.redmine.issue-statuses.list` | Redmine: список статусов | Справочник статусов |

Справка — `help.md` в каталогах `src/redmine/*/`.

## Конфигурация в редакторе

- Включите плагин **Redmine** в workspace.
- **Base URL** и **API key** (ref) — на узлах, где нужен доступ к API.
- Id проекта, subject, custom fields — по типу узла.

## Для разработчика

**Пакет:** `@conveyor/plugin-redmine` · **pluginId:** `redmine`

**Структура:**

```
redmine/
  src/
    redmine-manifest.builder.ts
    redmine-batch.source.ts
    redmine/client/redmine.client.ts
    redmine/issue/ redmine/wiki/ redmine/reference/
```

**Сборка:**

```bash
npm run build -w @conveyor/plugin-redmine
```

**Docker:** сервис `redmine`, порт **9402** ([`docker-compose.yml`](../docker-compose.yml)).

**Клиент:** `RedmineClient` — обёртка над REST с API key header.
