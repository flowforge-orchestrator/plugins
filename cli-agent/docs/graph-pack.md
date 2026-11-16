# Graph-kg pack → CLI agents

Shared **pack contract** from `packs/graph-kg/pack.json`: tools / skills / workspace. One published process holds **all** `plugin.cli-agent.*` nodes in parallel; two combiners emit the pack JSON and fan out to every agent.

**Soft guidance:** skills + `AGENTS.md` describe MCP tools `rag_search` / `rag_graph` and the mandatory `grounded-answer` gate. Shell bins remain as fallback.

**Tool pipeline:** `plugin.cli-agent.tool-instance` (static meta + source) → **dynamic** inputs on `plugin.cli-agent.tool-provider` (only wired ports; see executor help) → agent `mcpAttach`. Names live in instance meta; provider binds them into stdio MCP (`bin/instance-mcp.mjs` + `TOOL_PROVIDER_TOOLS`). CLI adapters only translate attach → native MCP config.

**Metrics:** `collectRunMetrics` / `metricsJson` on each CLI executor (top-30 keys + `extras`; null = not observed in-run). Per-agent `plugin.execution.code` extractors sit before `system.output`: one enriches `metricsJson` (taskSuccess / answerRelevance / refusal), another cleans `text` → `answer_*`.

**Apply note:** after `process_apply`, `system.output` and agent `tools`/`skills`/`workspace` keep `isPort: true` (`ensureOutputPorts` in `apply-cli-combiner.mjs`).

**Packs:** `CLI_COMBINER_PACK=graph-kg` (default) | `add-two` | `none`. Verify graph fan-out: `node scripts/verify-graph-kg.mjs`. Verify add-two ON/OFF/memory: `node scripts/verify-add-two.mjs`.

## Contract (trigger / process.call)

| Field | Pack value |
| --- | --- |
| tools | `search`, `graph` → `/workspace/bin/rag-search`, `/workspace/bin/rag-graph` |
| skills | `grounded-answer`, `graph-kg`, `vector-search` |
| workspace | `/var/lib/cli-agent/workspaces/graph-pack` |

## Graph shape

```
trigger.query ─────────────────────────→ every agent.task
llm-config (ollama | gigachat) ───────→ every agent.llmConfig
tools / skills / MCP / skills / rules → every agent attach ports
agent[i].metricsJson → extract metrics → agent[i+1].awaiter   (sequential)
per-agent static: workspace / timeoutMs
```

Agents run **one after another**: each node after the first has port `awaiter` wired from the previous agent's enriched metrics (`plugin.execution.code` extractor). The awaiter value is ignored; it only gates start. First agent has no awaiter.

Process start / `process.call` payload is `{ query }` (input port on `system.trigger.input`). Apply: `node scripts/apply-cli-combiner.mjs`. Switch endpoint with `CLI_LLM=ollama|gigachat` (same agent edges).

**Golden dataset loop:** outer process `CLI agents: golden dataset loop` runs `system.loop` (sequential) over `scripts/smoke/chuk-gek/questions.json`; each iteration `process.call` → combiner with that question. Apply: `node scripts/apply-cli-dataset-loop.mjs` (`CLI_DATASET_LIMIT=N` for a smoke subset). Aider is capped at **30s** (`timeoutMs` + shell `timeout 30`).

## Workspace install

```bash
docker cp packs/graph-kg/. flowforge-demo-cli-agent-1:/var/lib/cli-agent/workspaces/graph-pack/
docker exec flowforge-demo-cli-agent-1 sh -c '
  cd /var/lib/cli-agent/workspaces/graph-pack &&
  mkdir -p .agents/skills && cp -R skills/* .agents/skills/ &&
  chmod +x bin/rag-search bin/rag-graph &&
  (test -d .git || git init -q)
'
```

## Live processes

Folder **Graph pack** (`ca314815-30d9-4f9a-9890-3a3a34275acd`):

| Process | diagramId | MCP tool |
| --- | --- | --- |
| CLI agents: tools+skills combiner | `8fc3f03d-7a09-4b4a-8cd8-606b8dd7fbd7` | `cli_agent_tools_skills_combiner` |
| CLI agents: golden dataset loop | `ec05a4d6-81ff-4806-9e72-e97c69c6368b` | `cli_agent_golden_dataset_loop` |

All `plugin.cli-agent.*` nodes sit in that one graph in parallel. Shared `tools combiner` / `skills combiner` (`plugin.execution.code`) fan out pack JSON to every agent’s `tools` / `skills` ports. Apply / re-wire: `CLEAN=1 node scripts/apply-cli-combiner.mjs`.

## Live executors (chuk_i_gek)

Workspace bins call helper processes (collection baked in):

| Bin | Process | diagramId |
| --- | --- | --- |
| `/workspace/bin/rag-search` | `chuk_i_gek: vector search` | `0ebb1a12-871c-4eb5-af51-47a7bb6ec450` |
| `/workspace/bin/rag-graph` | `chuk_i_gek: graph` | `229933d8-e8d0-4b94-85ac-fc7c6af216e2` |

Wiring check (no agent run required): `node scripts/apply-cli-combiner.mjs` prints `COMBINER_WIRING_PASS` when every CLI node receives tools+skills from the combiners.

Catalog of Wave A/B/C: `catalog/waves.json`.
