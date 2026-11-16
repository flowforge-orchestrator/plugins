---
name: vector-search
description: Dense search over chuk_i_gek via executable bin/rag-search.
version: 0.6.0
metadata:
  hermes:
    tags: [Search, Vector, RAG, Embeddings]
---

# Skill: vector-search

Collection: **chuk_i_gek** (story «Чук и Гек»).

## When to use

Prose / scene questions (what they saw, dialogue, atmosphere, sequence of events).

## Tool (prefer MCP)

Call MCP tool **`rag_search`** with `{ "query": "<natural language>" }`.

Local server: `node /workspace/bin/rag-mcp.mjs` (stdio). Shell fallback:

```bash
/workspace/bin/rag-search "<natural language query>"
```

Tip: pass the user’s question or a tight paraphrase. If the first hit is a
neighbor scene, re-query with the decisive noun from the question.

## Workflow

1. Call `rag_search` (MCP) or the shell fallback.
2. Read the returned chunks (doc ids + excerpts).
3. **Before answering**, apply skill `grounded-answer` (relevance, answers,
   sufficient, non-redundant, no contradictions, no refutations).
4. Only then emit a short answer (1–3 sentences), or refuse / re-search per
   that skill.

## Tips

- For entity/relation structure, prefer skill `graph-kg` / `rag-graph`.
- If the tool errors, report the error — do not invent plot.
- No coding, git, or file edits from this skill.
