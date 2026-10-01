import type {
  AgentObservations,
  Claim,
  Inventory,
  QuestionFrame,
  Verdict,
  VerdictGap,
} from '../agent/turn/agent.turn.logic';

export type { Claim, Verdict, VerdictGap };

/** What the model returns. Each claim is one atomic value the draft states. */
export type JudgeLlmPayload = {
  claims?: unknown;
  slotsUnknown?: unknown;
};

export type JudgeReading = {
  claims: Claim[];
  /** Slots the draft explicitly marks as not stated in the documents. */
  slotsUnknown: string[];
};

export function buildJudgeSystemPrompt(): string {
  return [
    'You split a draft answer into atomic claims and check each against the evidence.',
    'Return JSON: {"claims":[{"docId":string,"slot":string,"fact":string,"value":string,"supported":boolean}],"slotsUnknown":string[]}.',
    'One claim per stated value. slot is the frame slot the value fills; use the names from frame.slots when the claim fills one of them.',
    'fact identifies the single fact the value states, specific enough that two claims with the same docId and fact but different values contradict each other. Distinct provisions, cases, or items under one slot get distinct facts.',
    'docId is the document the value is attributed to; use the identifiers from inventory or context. Empty when the draft attributes the value to no document.',
    'supported is true only when the value is stated in the evidence for that docId. Do not use your own knowledge.',
    'slotsUnknown lists the frame slots the draft explicitly says the documents do not state.',
    'Do not rewrite the draft. Do not add claims the draft does not make.',
  ].join('\n');
}

export function buildJudgeUserPrompt(input: {
  question: string;
  draft: string;
  frame?: QuestionFrame;
  inventory?: Inventory;
  observations: AgentObservations;
}): string {
  const evidence: Record<string, unknown> = {};
  if (input.observations.context) {
    evidence.context = input.observations.context.slice(0, 12000);
  }
  if (input.observations.graphContext) {
    evidence.graphContext = input.observations.graphContext.slice(0, 4000);
  }
  if (input.observations.ontologyContext) {
    evidence.ontologyContext = input.observations.ontologyContext.slice(0, 2000);
  }
  if (Array.isArray(input.observations.hits) && input.observations.hits.length) {
    evidence.hits = input.observations.hits.slice(0, 40).map((hit) => ({
      chunkId: hit.chunkId,
      docId: hit.docId,
      text: String(hit.text ?? '').slice(0, 600),
    }));
  }
  return JSON.stringify(
    {
      question: input.question,
      draft: input.draft,
      frame: input.frame ?? null,
      inventory: input.inventory ?? null,
      evidence,
    },
    null,
    2,
  );
}

export function readJudgePayload(payload: unknown): JudgeReading {
  const row =
    payload && typeof payload === 'object'
      ? (payload as JudgeLlmPayload)
      : ({} as JudgeLlmPayload);
  const claims: Claim[] = [];
  if (Array.isArray(row.claims)) {
    for (const item of row.claims) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Record<string, unknown>;
      const slot = String(c.slot ?? '').trim();
      const value = String(c.value ?? '').trim();
      if (!slot && !value) continue;
      const docId = String(c.docId ?? '').trim();
      const fact = String(c.fact ?? '').trim();
      claims.push({
        ...(docId ? { docId } : {}),
        slot: slot || 'value',
        ...(fact ? { fact } : {}),
        value,
        supported: c.supported === true,
      });
    }
  }
  const slotsUnknown = Array.isArray(row.slotsUnknown)
    ? row.slotsUnknown
        .map((s) => String(s ?? '').trim())
        .filter(Boolean)
    : [];
  return { claims, slotsUnknown };
}

const GAP_DETAIL: Record<VerdictGap['kind'], string> = {
  no_draft: 'no draft answer this turn',
  unsupported: 'value is not in the evidence for this docId',
  conflict: 'two different values for one fact in one document',
  missing_slot: 'frame slot is neither filled by a claim nor marked unknown',
  missing_doc: 'inventory document is not addressed by any claim',
  missing_frame: 'observations.frame is missing',
  no_inventory:
    'frame.population is collection and observations.inventory is missing',
  judge_unavailable: 'judge model call failed; verdict not computed',
};

function gap(row: Omit<VerdictGap, 'detail'>): VerdictGap {
  return { ...row, detail: GAP_DETAIL[row.kind] };
}

/**
 * The three flags are computed from the structure of the claims only.
 *  consistent — no two different values at the same (docId, fact); fact defaults to slot
 *  sufficient — every claim is supported
 *  complete   — collection: every inventory docId is cited;
 *               otherwise: every frame slot is filled by a claim or marked unknown;
 *               without a frame completeness cannot be certified
 */
export function judgeVerdict(input: {
  reading: JudgeReading;
  frame?: QuestionFrame;
  inventory?: Inventory;
  draft: string;
}): Verdict {
  const { claims, slotsUnknown } = input.reading;
  const gaps: VerdictGap[] = [];

  if (!input.draft.trim()) {
    gaps.push(gap({ kind: 'no_draft' }));
    return { consistent: true, sufficient: false, complete: false, gaps, claims };
  }

  const seen = new Map<string, string>();
  let consistent = true;
  for (const claim of claims) {
    const key = `${claim.docId ?? ''}\u0000${claim.fact ?? claim.slot}`;
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, claim.value);
    } else if (prior !== claim.value) {
      consistent = false;
      gaps.push(
        gap({
          kind: 'conflict',
          slot: claim.slot,
          docId: claim.docId,
          value: `${prior} | ${claim.value}`,
        }),
      );
    }
  }

  let sufficient = true;
  for (const claim of claims) {
    if (claim.supported) continue;
    sufficient = false;
    gaps.push(
      gap({
        kind: 'unsupported',
        slot: claim.slot,
        docId: claim.docId,
        value: claim.value,
      }),
    );
  }

  let complete = true;
  const population = input.frame?.population ?? 'none';
  if (!input.frame) {
    complete = false;
    gaps.push(gap({ kind: 'missing_frame' }));
  } else if (population === 'collection') {
    if (!input.inventory) {
      complete = false;
      gaps.push(gap({ kind: 'no_inventory' }));
    } else {
      const cited = new Set(
        claims.map((claim) => claim.docId ?? '').filter(Boolean),
      );
      for (const doc of input.inventory.documents) {
        if (cited.has(doc.docId)) continue;
        complete = false;
        gaps.push(gap({ kind: 'missing_doc', docId: doc.docId }));
      }
    }
  } else {
    const filled = new Set(claims.map((claim) => claim.slot));
    const unknown = new Set(slotsUnknown);
    for (const slot of input.frame?.slots ?? []) {
      if (filled.has(slot) || unknown.has(slot)) continue;
      complete = false;
      gaps.push(gap({ kind: 'missing_slot', slot }));
    }
  }

  return { consistent, sufficient, complete, gaps, claims };
}

export function verdictForSkippedRetrieval(): Verdict {
  return { consistent: true, sufficient: true, complete: true, gaps: [], claims: [] };
}

export function verdictWhenJudgeUnavailable(draft: string): Verdict {
  return {
    consistent: true,
    sufficient: false,
    complete: false,
    gaps: [
      draft.trim()
        ? gap({ kind: 'judge_unavailable' })
        : gap({ kind: 'no_draft' }),
    ],
    claims: [],
  };
}
