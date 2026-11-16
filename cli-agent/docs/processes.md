# CLI agents processes

Wave A processes share one contract. Create the catalog folder first (Process Builder cannot create folders), then create and publish seven processes after `plugin.cli-agent.*` executors are in the library.

## Folder

```http
POST /folder
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "CLI agents", "parentId": null }
```

Save the returned folder `id` as `FOLDER_ID`.

Or run:

```bash
CONVEYOR_API_BASE=http://localhost:8080 \
CONVEYOR_API_TOKEN=<token> \
node scripts/create-cli-agent-folder.mjs
```

## Process graph (identical ports)

For each slug in `hermes`, `claude-code`, `codex`, `cursor`, `aider`, `opencode`, `zai`:

1. `process_create` with `title` = display name and `folderId` = `FOLDER_ID`
2. `process_apply` with nodes/edges below and triggers `manual` + `mcp_tool` (`cli_agent_<slug_with_underscores>`)
3. `process_validate`
4. `process_publish`

Trigger tool names: `cli_agent_hermes`, `cli_agent_claude_code`, `cli_agent_codex`, `cli_agent_cursor`, `cli_agent_aider`, `cli_agent_opencode`, `cli_agent_zai`.

### Nodes

Input ports on `system.trigger.input` / agent / `system.output`:

`task`, `provider`, `model`, `baseUrl`, `tools`, `skills`, `workspace`, `timeoutMs`

Output ports:

`text`, `stdout`, `stderr`, `truncated`, `stdoutBytes`, `stderrBytes`, `exitCode`, `status`, `usageKnown`, `inputTokens`, `outputTokens`, `totalTokens`, `workspaceMounted`

`apiKey` stays on the agent node as a static secret ref and is not a process port.

See `scripts/process-graph.template.json` for the `process_apply` payload shape (replace `__SLUG__` and `__NODE_TYPE__`).

## Preconditions

- Plugin sidecar `cli-agent` published; `executor_list` query `cli-agent` returns seven nodeTypes
- Folder `CLI agents` exists
- Process Builder MCP authenticated to the target workspace
