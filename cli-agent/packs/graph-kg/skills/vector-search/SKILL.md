---
name: vector-search
description: Dense search over chuk_i_gek via MCP tool rag_search.
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

Tip: pass the user’s question or a tight paraphrase. If the first hit is a
neighbor scene, re-query with the decisive noun from the question.

## Workflow

1. Call `rag_search` (MCP).
2. Read the returned chunks (doc ids + excerpts).
3. **Before answering**, apply skill `grounded-answer` (relevance, answers,
   sufficient, non-redundant, no contradictions, no refutations).
4. Only then emit a short answer (1–3 sentences), or refuse / re-search per
   that skill.

## Tips

- For entity/relation structure, prefer skill `graph-kg` / `rag-graph`.
- If the tool errors, report the error — do not invent plot.
- No coding, git, or file edits from this skill.
