---
name: grounded-answer
description: >-
  Gate after rag-search / rag-graph: prove the claim is relevant, answers the
  question, is sufficient and non-redundant, and is free of contradictions or
  refutations in the retrieved evidence. Use before every final answer from
  the chuk_i_gek pack.
version: 0.1.0
metadata:
  hermes:
    tags: [RAG, Grounding, Justification, Verification]
---

# Skill: grounded-answer

Retrieval alone is not enough. Selecting a chunk from the vector store (or a
graph neighborhood) is **not** an answer until you justify it.

Collection: **chuk_i_gek**. Evidence = tool stdout only (`rag-search` /
`rag-graph`). **FORBIDDEN** to use model memory / prior knowledge — no invented
plot.

## When to use

After every successful retrieval, **before** the user-facing answer.
If any check fails → re-query with a tighter paraphrase, or say the corpus
does not support a grounded answer. Do not emit a best-guess from a weak hit.

## Gate (all must pass)

Work through these checks **in order**. For each, keep a silent yes/no; only
the final answer is spoken to the user (short, 1–3 sentences).

### 1. Relevance — имеет отношение к вопросу

- The evidence must be about the **same episode / entity / relation** the
  question asks about.
- A top vector hit on a **neighbor scene** (e.g. «письмо» when the question
  asks about «телеграмма») **fails** this check — re-search, do not answer
  from that hit.

### 2. Answers the question — является ответом на вопрос

- The evidence must contain (or entail) a direct answer to the **asked**
  question, not a related fact.
- If you only have context, atmosphere, or a different Q&A → fail.

### 3. Sufficient — является ДОСТАТОЧНЫМ ответом

- A reader who trusts only your answer must be able to resolve the question
  without guessing missing slots (who / what / where / which object).
- Partial or vague paraphrase that leaves the decisive noun out → fail;
  fetch more or refuse.

### 4. Non-redundant — не является избыточным ответом

- Prefer the **minimal** claim that still passes (3).
- Drop side plots, duplicate quotes, and essay padding.
- If two chunks say the same thing, cite once.

### 5. No contradictions — не имеет противоречий в системе

- Across **all** retrieved snippets in this turn, nothing may assert the
  opposite of your claim (different person, place, object, outcome).
- If A and B conflict → do not pick a side from rank alone; re-query or
  refuse. Prefer the snippet that names the asked entity explicitly.

### 6. No refutation — не содержит опровержений ответа

- The same evidence must not undermine your answer (negation, correction,
  «не то», other subject doing the action, wrong object).
- Example failure: answering «сторож» while the controlling sentence’s
  subject is «ямщик» and «сторож» appears only as a place/role word.

## Workflow

1. Run `vector-search` and/or `graph-kg` tools as needed (at least one).
2. Draft a candidate answer **only** from stdout.
3. Run the six checks above against that candidate and the **full** tool
   output of this turn.
4. On any fail: one re-search (different query / other bin), then re-check.
   Still fail → short refusal: evidence is insufficient or conflicting.
5. On all pass: emit the short answer. Optional: one short quote ≤12 words
   from the supporting snippet.

## Anti-patterns

- Answering from the first chunk because it «looks close».
- Treating a substring match (e.g. «сторожку» ≈ «сторож») as proof of the
  subject.
- Mixing letter-scene and telegram-scene without re-checking relevance.
- Padding with plot remembered outside tool stdout.

## Tools (reference)

Use attached MCP tools **`rag_search`** and **`rag_graph`**.
