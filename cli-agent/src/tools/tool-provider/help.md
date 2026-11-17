# CLI tool provider

Собирает **динамический** набор ToolInstance и биндит их в opaque `mcpAttach` для CLI-агента.

## Динамические входы

В каталоге **нет** фиксированных портов `tool1…toolN`. Входы задаются на узле в редакторе (настройки → добавить вход) или в графе:

- каждый **вход-порт** — одна строка ToolInstance JSON (`plugin.cli-agent.tool-instance` → `instance`);
- имя порта любое (`rag_search`, `tool1`, …); в MCP попадает `meta.name` из instance;
- узел стартует, когда заполнены **только объявленные** порты — пустых «заготовок» в манифесте нет.

Не-портовые поля конфигурации (опционально):

| Name | Назначение | Default |
| --- | --- | --- |
| `apiBase` | `CONVEYOR_API_BASE` в env MCP | `http://host.docker.internal:18080` |
| `mcpBridgePath` | stdio bridge в контейнере агента (ephemeral) | `/tmp/tool-provider-mcp.mjs` |
| `serverId` | id MCP server в attach | `tool-provider` |

## Выходы

| Name | Описание |
| --- | --- |
| `mcpAttach` | Opaque JSON для порта `mcpAttach` CLI-агента |
| `toolNames` | JSON-массив имён tools из instances |
| `sessionId` | id привязки этого запуска провайдера |
| `status` | `ok` или `error: …` |

## Связка

`tool-instance` → (динамический вход провайдера) → `mcpAttach` → CLI agent.

Агент не знает pack-путей: только подключает servers из attach. Вызов tool = `tools/call` на bridge с `TOOL_PROVIDER_TOOLS` этого запуска.
