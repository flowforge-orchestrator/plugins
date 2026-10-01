# @conveyor/plugin-rag

Document RAG for Conveyor: chunk and index files into a plugin-owned vector store and knowledge graph, search the corpus, and run an ask agent that retrieves only through the search executor.

## Purpose

The plugin packages indexing, ontology enrichment, hybrid search, and a retrieval agent as Conveyor executors. Qdrant and Neo4j stay inside the plugin compose network. The platform sees `plugin.rag.*` node contracts, node `ref` secrets, manifest `variables` labels, and three workspace forms (`index`, `search`, `ask`).

Secrets are node `ref` fields (`OPENAI_API_KEY` kind for embedding and chat). Store URLs (`QDRANT_URL`, `NEO4J_URI`) come from container env. Manifest `variables` (`embeddingModel`, `llmModel`) appear on the Plugins tab; in v1 executors still read `EMBEDDING_MODEL` / `LLM_MODEL` from env because the runtime does not inject plugin variable values into `ExecContext`.

## Nodes

| nodeType | Name | Description |
| --- | --- | --- |
| `plugin.rag.extract` | RAG: извлечь документ | Text/URL → document blocks |
| `plugin.rag.chunk` | RAG: нарезать чанки | Structural chunking |
| `plugin.rag.ontology.propose.entities` | RAG: предложить типы сущностей | LLM entity type candidates |
| `plugin.rag.ontology.propose.relations` | RAG: предложить типы связей | LLM relation type candidates |
| `plugin.rag.ontology.merge` | RAG: слить онтологию | Schema merge + version bump |
| `plugin.rag.ontology.lookup` | RAG: lookup онтологии | Schema types and entities whose label contains the whole query |
| `plugin.rag.graph.query` | RAG: обход графа | Parameterized Cypher neighborhood of the entity, node, or relation named in the query |
| `plugin.rag.graph.prepare` | RAG: инвентарь коллекции | Every document of the collection: `docId` and stored title |
| `plugin.rag.entity.extract` | RAG: извлечь упоминания | Mentions into closed schema |
| `plugin.rag.entity.resolve` | RAG: разрешить сущности | Canonical entities + rebind |
| `plugin.rag.relation.extract` | RAG: извлечь связи | Relations with evidence |
| `plugin.rag.index.write` | RAG: записать индекс | Embed + upsert vector/graph |
| `plugin.rag.search.query` | RAG: поиск | Hybrid search; one `topK`; honours `frame.skipRetrieval` |
| `plugin.rag.rerank` | RAG: реранк | LLM/Ollama rerank + doc diversity |
| `plugin.rag.topic` | RAG: рамка вопроса | Model-written frame: population (collection / named / none), slots, entity, skipRetrieval |
| `plugin.rag.agent.plan` | RAG: стратегия | Select of plugin strategies; output `strategy` into the agent turn |
| `plugin.rag.provider.search` | RAG: провайдер поиска | Search card; collection id and topK live here |
| `plugin.rag.provider.graph` | RAG: провайдер графа | Graph card; collection id lives here |
| `plugin.rag.provider.ontology` | RAG: провайдер онтологии | Ontology card; collection id lives here |
| `plugin.rag.provider.prepare` | RAG: провайдер инвентаря | Inventory card (`inventory`); collection id lives here |
| `plugin.rag.provider.topic` | RAG: провайдер рамки вопроса | Frame card |
| `plugin.rag.provider.rerank` | RAG: провайдер реранка | Rerank card; topK and maxPerDoc |
| `plugin.rag.tool.router` | RAG: роутер инструментов | Merges provider cards into the agent `tools` input |
| `plugin.rag.agent.turn` | RAG: ход агента | Model returns an ordered `actions` set and a draft; the turn runs the set in order and threads `observations` |
| `plugin.rag.slot.propose` | RAG: значения полей | Model copies one span per open field from one evidence record, or leaves the field out |
| `plugin.rag.claims` | RAG: claims из предложений | Keeps a proposal only when its span lies inside the named evidence record |
| `plugin.rag.slot.critic` | RAG: критик полей | Model confirms a span states its field; a rejected span leaves the field open |
| `plugin.rag.judge` | RAG: судья | Code check of claims against evidence: copy, parents of derived values, conflicts, missing fields |
| `plugin.rag.guard` | RAG: гард цикла | `continueLoop` from the verdict, conflict, `skipRetrieval`, or `maxTurns`; answer passes through |
| `plugin.rag.answer` | RAG: ответ LLM | Thin generator (linear debug) |

Per-executor details: each folder’s `help.md`.

## Editor configuration

1. Enable the **RAG по документам** plugin on the Plugins tab.
2. Bind `ref` secrets on LLM/embedding fields of the nodes you use.
3. Set `collectionId` / `docId` / strategy / `topK` as static fields or ports.
4. Workspace islands:

```md
:ff-plugin-form{plugin-id="rag" form-id="index" diagram-id="…" refresh-interval="5000"}
:ff-plugin-form{plugin-id="rag" form-id="ask" diagram-id="…" refresh-interval="4000"}
:ff-plugin-form{plugin-id="rag" form-id="stats-pipeline" diagram-id="…" refresh-interval="8000"}
:ff-plugin-form{plugin-id="rag" form-id="stats-chat" diagram-id="…" refresh-interval="8000"}
```

Forms: `index` (DOC/PDF/image/ZIP), `ask` (chat), `stats-pipeline`, `stats-chat`, plus `search`.

Builtin preset `rag` (`presets/rag.json`, catalog id `rag`) is one folder of three processes: index, search, chat. Register it via the Presets tab.

Chat process (`rag-chat`): schema (`graph.prepare` → evidence) and question frame (`topic`, mode `direct|retrieval|analysis|research`) run once, then `system.loop`. Inside the loop, `system.control.switch` opens one arm. `direct` forwards observations and stops. `retrieval`, `analysis`, and `research` share the turn. One `op` per iteration runs `search`, `graph`, `ontology`, `aggregate`, or `calculate` on the diagram. Search hits are candidates, not field values. `slot.propose` asks the model for one verbatim span per open field from one evidence record, or nothing; `claims` keeps a proposal only when the span lies inside the record it names; `slot.critic` asks the model whether that span states the field and drops the claim otherwise; `judge` checks the claim records in code. An open field does not end the loop: the next turn queries it, or records it on `unresolvedQuestions` when it was already asked and no claim was accepted. That decision belongs to the turn, not to propose or critic. `analysis` and `research` call the planner model only when their queue is empty; `retrieval` does not. The loop closes when the verdict is complete, a value conflict is explicit, or `maxTurns` is spent. The arm that produced values fills the single `system.output`. After the loop, `synthesize` writes the answer from supported claims, hypotheses, and limitations (`direct` answers the message without the corpus), and `safety` checks the claim records. The turn does not call tools.

`plugin.rag.agent.turn` never talks to Qdrant/Neo4j; retrieval nodes do.

## For developers

- Package: `@conveyor/plugin-rag`, `pluginId` `rag`, prefix `plugin.rag.`
- Layout: `src/` executors + adapters, `ui/` forms, `presets/`, `scripts/build-ui.mjs`
- Build: `npm run build -w @conveyor/plugin-rag`
- Test: `npm test -w @conveyor/plugin-rag`
- Default ports: executor TCP **9406**, asset HTTP **9407**
- Env sample: `env.example`
- Local stack with stores against demo:

```bash
# demo already up (Hub: flowforge-demo_default, tokens often key/key)
docker compose -f compose.rag.yml --env-file compose.rag.env.example up -d --build
```

Ollama must listen on the host (`embeddinggemma:latest`, `gemma4:12b-mlx`, `qwen3:0.6b` rerank by default). The sidecar reaches it via `host.docker.internal`.

External core without the bundled stores: service `rag` in root `docker-compose.yml` (point `QDRANT_URL` / `NEO4J_*` at reachable stores).

### Plugin update (after rebuild)

1. Disable and remove the plugin in the UI (Plugins tab, administrator).
2. Restart the sidecar (`docker compose -f compose.rag.yml up -d --build rag`).
3. Enable the plugin again under the target workspace user.

Verify: sidecar logs show the new `publicationVersion`; plugin-manager logs `plugin_publication_committed` and `plugin_static_cached`; nodes appear online in the palette.

### Local Ollama smoke

With Ollama running (`embeddinggemma:latest` + `gemma4:12b-mlx`) and host Qdrant/Neo4j:

```bash
RUN_OLLAMA_SMOKE=1 npm test -w @conveyor/plugin-rag -- ollama.smoke --runInBand
```
