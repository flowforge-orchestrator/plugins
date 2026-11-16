---
name: graph-kg
description: Query the chuk_i_gek knowledge graph via executable bin/rag-graph.
version: 0.6.0
metadata:
  hermes:
    tags: [Graph, Knowledge-Base, RAG, Neo4j]
---

# Skill: graph-kg

Collection: **chuk_i_gek** (story «Чук и Гек»).

## When to use

Entity / relation questions (who, parent, place names, graph links).

## Tool (prefer MCP)

Call MCP tool **`rag_graph`** with `{ "query": "<entity or relation>" }`.

Examples: `Чук`, `Гек`, `мать`, `ямщик`, `база`, `is_parent_of`.

Local server: `node /workspace/bin/rag-mcp.mjs` (stdio). Shell fallback:

```bash
/workspace/bin/rag-graph "<entity or relation name>"
```

## Workflow

1. Call `rag_graph` (MCP) or the shell fallback.
2. Read entities, relations, short quotes, doc ids.
3. **Before answering**, apply skill `grounded-answer` (relevance, answers,
   sufficient, non-redundant, no contradictions, no refutations).
4. Only then emit a short answer (1–3 sentences), or refuse / re-search per
   that skill.

## Tips

- For free-text “what happened” scenes, prefer skill `vector-search` / `rag-search`.
- If the tool errors, report the error — do not invent plot.
- No coding, git, or file edits from this skill.
