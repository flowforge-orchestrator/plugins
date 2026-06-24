# @conveyor/plugin-jira

Плагин читает задачи из **Jira Cloud / Server** через REST API и добавляет узлы в библиотеку редактора Conveyor.

## Назначение

Интеграция нужна для сценариев, где процесс должен получать список issues текущего пользователя: фильтрация по статусам и типам, ограничение количества результатов, выбор полей ответа. Подключение к Jira настраивается на уровне узла (URL инстанса и API-токен), без переменных на карточке плагина.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `plugin.jira.issue.get` | Jira: получение списка задач | Список issues, назначенных пользователю токена; фильтры по статусам, типу, полям |

Подробные поля входов и выходов — в `help.md` рядом с executor'ом (`src/jira/issue/get-issue-list/help.md`).

## Конфигурация в редакторе

- Включите плагин **Jira** в настройках workspace (переключатель).
- На узле укажите **base URL** Jira (static) и **API token** (ref → секрет в Storage).
- Остальные параметры (статусы, лимит, поля) — порты или static поля узла.

## Для разработчика

**Пакет:** `@conveyor/plugin-jira` · **pluginId:** `jira`

**Структура:**

```
jira/
  src/
    jira-manifest.builder.ts
    jira-batch.source.ts
    jira/client/          # JiraClient, IssueService
    jira/issue/get-issue-list/
```

**Сборка и тесты** (из корня репозитория `plugins/`):

```bash
npm run build -w @conveyor/plugin-jira
```

**Docker:** сервис `jira` в [`compose.demo.yml`](../compose.demo.yml) и [`docker-compose.yml`](../docker-compose.yml). Порт executor TCP по умолчанию — **9401** (`PLUGIN_TCP_PORT` = `EXECUTOR_TCP_PORT` = `PORT`).

**Публикация:** batch pull по TCP; `PLUGIN_PULL_ADVERTISED_HOST` — DNS-имя сервиса, с которого plugin-manager забирает список executor'ов. Образец переменных — по аналогии с [`telegram/env.example`](../telegram/env.example).

**SDK:** `@kosolapus/plugin-ts-sdk` (версия в корневом `package.json` → `overrides`).
