# Graph-kg pack

Collection **chuk_i_gek** (story «Чук и Гек»).

Skills and MCP tools are materialized under `/tmp/pack` for the run (no host mount).

## Hard rule

**FORBIDDEN** to use your own memory, training data, or prior knowledge for story
facts. Use only attached MCP tools and skills. If tools are unavailable or fail,
say so honestly — do not invent an answer.

## Answer workflow

1. Read skills under `skills/` if your CLI loads them.
2. For a story question: call **at least one** MCP tool (`rag_search` and/or
   `rag_graph`).
3. **Mandatory:** apply skill `grounded-answer` before the final reply —
   prove relevance, that the claim answers the question, sufficiency,
   non-redundancy, no contradictions, no refutations in the evidence.
4. Prefer a short factual answer; do not invent plot details.
5. A top vector hit is not enough by itself — if the gate fails, re-query or
   refuse.

## Tools

Use attached MCP tools `rag_search` and `rag_graph` (stdio bridge at
`/tmp/tool-provider-mcp.mjs`). Tool stdout is the source of truth for story
facts.

Examples for graph: `Чук`, `Гек`, `мать`, `ямщик`, `база`, `is_parent_of`.

## Guidance

- If a tool fails, say so briefly — do not fill gaps from memory.
- No coding, git, file edits, MEMORY.md, or chat-history digressions.
