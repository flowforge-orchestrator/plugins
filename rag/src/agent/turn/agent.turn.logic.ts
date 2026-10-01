import type { Citation, SearchHit } from '../../contracts/types';
import type {
  Evidence,
  Hypothesis,
  ResearchClaim,
  ResearchTask,
  SlotProposal,
  StepRequest,
} from '../../research/model';
import {
  normalizeClaimList,
  normalizeEvidenceList,
  normalizeHypotheses,
  normalizeProposals,
  normalizeQueue,
  normalizeTask,
} from '../../research/model';
import { normalizeStrategy, strategyPrompt } from './planning';

export type AgentAtom = { id: string; body: string };

export type AgentToolSchema = {
  id: string;
  description: string;
  args?: Record<string, string>;
  nodeType?: string;
  config?: Record<string, unknown>;
};

/** What the question asks for. Written by the frame tool, read by judge and gate. */
export type QuestionFrame = {
  population: 'collection' | 'named' | 'none';
  slots: string[];
  entity?: string;
  skipRetrieval: boolean;
  reason?: string;
};

export type InventoryDoc = { docId: string; title: string };

/** Every document of the collection. Written by the inventory tool. */
export type Inventory = {
  docCount: number;
  documents: InventoryDoc[];
};

export type VerdictGap = {
  kind:
    | 'unsupported'
    | 'conflict'
    | 'missing_slot'
    | 'missing_doc'
    | 'missing_frame'
    | 'no_inventory'
    | 'no_draft'
    | 'judge_unavailable';
  slot?: string;
  docId?: string;
  value?: string;
  /** What observation closes the gap. Written by the judge from the gap kind. */
  detail?: string;
};

export type Claim = {
  docId?: string;
  /** Frame slot the value fills. */
  slot: string;
  /** Identity of the fact; two claims with one (docId, fact) and different values contradict. Defaults to slot. */
  fact?: string;
  value: string;
  supported: boolean;
};

/** Written only by the judge. The gate reads it. */
export type Verdict = {
  consistent: boolean;
  sufficient: boolean;
  complete: boolean;
  gaps: VerdictGap[];
  claims: Claim[];
};

export type AgentObservations = {
  hits?: SearchHit[];
  context?: string;
  ontologyContext?: string;
  graphContext?: string;
  frame?: QuestionFrame;
  inventory?: Inventory;
  draftAnswer?: string;
  verdict?: Verdict;
  turnNotes?: string[];
  /** Plan text written by the model. Kept as a trace, never executed by code. */
  plan?: string[];
  goals?: string[];
  thought?: string;
  evidence?: Evidence[];
  researchClaims?: ResearchClaim[];
  hypotheses?: Hypothesis[];
  task?: ResearchTask;
  /** Ops the model already chose, waiting for later iterations. */
  queue?: StepRequest[];
  /** Field values proposed as spans of evidence; claims are built from these. */
  proposals?: SlotProposal[];
  limitations?: string[];
};

export type AgentAction = { id: string; query?: string };

export type AgentTurnLlmPayload = {
  actions?: unknown;
  action?: string;
  query?: string;
  answer?: string;
  citationChunkIds?: string[];
  thought?: string;
  plan?: string[];
  goals?: string[];
};

export type ParsedAgentTurn = {
  actions: AgentAction[];
  answer: string;
  citations: Citation[];
  observations: AgentObservations;
};

export const DEFAULT_AGENT_TOOLS: AgentToolSchema[] = [
  { id: 'topic', description: 'Frame of the question: population, slots, entity' },
  {
    id: 'search',
    description: 'Hybrid corpus search; requires query',
    args: { query: 'string' },
  },
  {
    id: 'ontology',
    description: 'Entity types and entities whose label contains query',
    args: { query: 'string' },
  },
  {
    id: 'graph',
    description: 'Graph neighborhood of the entity named in query',
    args: { query: 'string' },
  },
  {
    id: 'inventory',
    description: 'Every document of the collection: docId and title',
  },
  {
    id: 'rerank',
    description: 'Rerank current hits for diversity/relevance; optional query',
    args: { query: 'string' },
  },
];

export function normalizeAtoms(raw: unknown): AgentAtom[] {
  if (raw == null || raw === '') return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        return [{ id: 'inline', body: trimmed.slice(0, 4000) }];
      }
    } else {
      return [{ id: 'inline', body: trimmed.slice(0, 4000) }];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: AgentAtom[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as { id?: unknown }).id ?? '').trim() || 'atom';
    const body = String(
      (item as { body?: unknown; content?: unknown }).body ??
        (item as { content?: unknown }).content ??
        '',
    ).trim();
    if (!body) continue;
    out.push({ id, body: body.slice(0, 4000) });
  }
  return out;
}

export function normalizeToolSchemas(raw: unknown): AgentToolSchema[] {
  if (raw == null || raw === '') return [...DEFAULT_AGENT_TOOLS];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [...DEFAULT_AGENT_TOOLS];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [...DEFAULT_AGENT_TOOLS];
    }
  }
  if (Array.isArray(value) && value.length === 0) return [];
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    const allow = new Set(
      (value as string[]).map((s) => s.trim().toLowerCase()).filter(Boolean),
    );
    const filtered = DEFAULT_AGENT_TOOLS.filter((t) => allow.has(t.id));
    return filtered.length ? filtered : [...DEFAULT_AGENT_TOOLS];
  }
  if (!Array.isArray(value)) return [...DEFAULT_AGENT_TOOLS];
  const out: AgentToolSchema[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as { id?: unknown }).id ?? '')
      .trim()
      .toLowerCase();
    if (!id) continue;
    const description = String(
      (item as { description?: unknown }).description ?? id,
    ).trim();
    const nodeType = String(
      (item as { nodeType?: unknown }).nodeType ?? '',
    ).trim();
    const rawConfig = (item as { config?: unknown }).config;
    const config =
      rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
        ? (rawConfig as Record<string, unknown>)
        : undefined;
    out.push({
      id,
      description: description.slice(0, 500),
      args: (item as { args?: Record<string, string> }).args,
      ...(nodeType ? { nodeType } : {}),
      ...(config ? { config } : {}),
    });
  }
  return out.length ? out : [...DEFAULT_AGENT_TOOLS];
}

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function cleanStrings(value: unknown, max: number, each = 120): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = cleanString(item, each);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeFrame(raw: unknown): QuestionFrame | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<QuestionFrame>;
  const population =
    row.population === 'collection' ||
    row.population === 'named' ||
    row.population === 'none'
      ? row.population
      : 'none';
  return {
    population,
    slots: cleanStrings(row.slots, 8),
    entity: cleanString(row.entity, 160),
    skipRetrieval: row.skipRetrieval === true,
    reason: cleanString(row.reason, 400),
  };
}

export function normalizeInventory(raw: unknown): Inventory | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<Inventory>;
  const documents: InventoryDoc[] = [];
  if (Array.isArray(row.documents)) {
    for (const item of row.documents) {
      if (!item || typeof item !== 'object') continue;
      const docId = cleanString((item as InventoryDoc).docId, 200);
      if (!docId) continue;
      documents.push({
        docId,
        title: cleanString((item as InventoryDoc).title, 300) ?? '',
      });
    }
  }
  const docCount =
    typeof row.docCount === 'number' && Number.isFinite(row.docCount)
      ? row.docCount
      : documents.length;
  return { docCount, documents };
}

const GAP_KINDS = new Set<VerdictGap['kind']>([
  'unsupported',
  'conflict',
  'missing_slot',
  'missing_doc',
  'no_inventory',
  'no_draft',
  'judge_unavailable',
]);

export function normalizeVerdict(raw: unknown): Verdict | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<Verdict>;
  const gaps: VerdictGap[] = [];
  if (Array.isArray(row.gaps)) {
    for (const item of row.gaps) {
      if (!item || typeof item !== 'object') continue;
      const kind = (item as VerdictGap).kind;
      if (!GAP_KINDS.has(kind)) continue;
      gaps.push({
        kind,
        slot: cleanString((item as VerdictGap).slot, 120),
        docId: cleanString((item as VerdictGap).docId, 200),
        value: cleanString((item as VerdictGap).value, 200),
        detail: cleanString((item as VerdictGap).detail, 300),
      });
      if (gaps.length >= 24) break;
    }
  }
  const claims: Claim[] = [];
  if (Array.isArray(row.claims)) {
    for (const item of row.claims) {
      if (!item || typeof item !== 'object') continue;
      const slot = cleanString((item as Claim).slot, 120);
      if (!slot) continue;
      claims.push({
        docId: cleanString((item as Claim).docId, 200),
        slot,
        value: cleanString((item as Claim).value, 300) ?? '',
        supported: (item as Claim).supported === true,
      });
      if (claims.length >= 120) break;
    }
  }
  return {
    consistent: row.consistent === true,
    sufficient: row.sufficient === true,
    complete: row.complete === true,
    gaps,
    claims,
  };
}

export function normalizeObservations(raw: unknown): AgentObservations {
  if (raw == null || raw === '') return {};
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { context: raw.slice(0, 12000) };
    }
  }
  if (Array.isArray(value)) {
    const hits = value.filter(
      (h): h is SearchHit =>
        !!h &&
        typeof h === 'object' &&
        typeof (h as SearchHit).chunkId === 'string' &&
        typeof (h as SearchHit).text === 'string',
    );
    return { hits };
  }
  if (!value || typeof value !== 'object') return {};
  const row = value as AgentObservations;
  return {
    hits: Array.isArray(row.hits) ? row.hits : undefined,
    context: typeof row.context === 'string' ? row.context : undefined,
    ontologyContext:
      typeof row.ontologyContext === 'string' ? row.ontologyContext : undefined,
    graphContext:
      typeof row.graphContext === 'string' ? row.graphContext : undefined,
    frame: normalizeFrame(row.frame),
    inventory: normalizeInventory(row.inventory),
    draftAnswer:
      typeof row.draftAnswer === 'string' ? row.draftAnswer : undefined,
    verdict: normalizeVerdict(row.verdict),
    turnNotes: Array.isArray(row.turnNotes)
      ? row.turnNotes.map(String)
      : undefined,
    plan: cleanStrings(row.plan, 8, 200).length
      ? cleanStrings(row.plan, 8, 200)
      : undefined,
    goals: cleanStrings(row.goals, 8, 200).length
      ? cleanStrings(row.goals, 8, 200)
      : undefined,
    thought: cleanString(row.thought, 500),
    evidence: normalizeEvidenceList(row.evidence),
    researchClaims: normalizeClaimList(row.researchClaims),
    hypotheses: normalizeHypotheses(row.hypotheses),
    task: normalizeTask(row.task),
    queue: normalizeQueue(row.queue),
    proposals: normalizeProposals(row.proposals),
    limitations: Array.isArray(row.limitations)
      ? row.limitations.map((item) => String(item).trim()).filter(Boolean).slice(0, 24)
      : undefined,
  };
}

export function buildAgentSystemPrompt(input: {
  rules?: AgentAtom[];
  skills?: AgentAtom[];
  tools?: AgentToolSchema[];
  strategy?: string;
  operatorPrompt?: string;
  maxActions?: number;
}): string {
  const tools = input.tools ?? DEFAULT_AGENT_TOOLS;
  const ids = tools.map((t) => t.id).join('|');
  const maxActions = input.maxActions ?? 4;
  const lines = [
    'You are a retrieval orchestration agent over a document collection whose domain you do not know in advance.',
    'You do not read stores yourself. Each turn you return the tools to run now, in order, and a draft answer when the evidence already supports one.',
    strategyPrompt(normalizeStrategy(input.strategy)),
    'Return a single JSON object:',
    `- actions: array of {id, query}; id is one of [${ids || 'none'}]; at most ${maxActions} items; [] when no tool is needed this turn`,
    '- query: the exact string the tool should look up (a fact to find, an entity name, a type). Not a question restatement when a name is known',
    '- answer: the reply text when observations already contain the evidence; empty string otherwise',
    '- thought: one sentence',
    '- plan: string[] when the strategy is cot',
    '- goals: string[] when the strategy is cog',
    '- citationChunkIds: chunk ids from observations.hits used in the answer',
    'observations is the evidence gathered so far: hits with docId, context, graphContext, ontologyContext, frame, inventory, verdict.',
    'observations.frame is written by the topic tool and is what the judge measures completeness against. When frame is null and topic is connected, topic is the first action of the set.',
    'observations.frame.skipRetrieval true means the message is not about the documents: actions [] and a short answer.',
    'observations.verdict lists gaps from the last judge pass; each gap says which observation closes it. Close each gap: run the tool that writes that observation, or state the slot as unknown in the answer. Returning the same answer with no actions does not close a gap.',
    'observations.inventory is written by the inventory tool. Gaps no_inventory and missing_doc are closed by running it and addressing every document it lists.',
    'Every value in the answer names its document (docId or title) and appears in observations. Do not state values that are not there.',
    'Write a draft answer on every turn where observations hold any evidence, even alongside actions: the judge measures the draft and returns the gaps, and the next turn closes them. A turn without a draft closes nothing.',
    'When documents disagree, keep each as its own line. When the question covers the whole collection, every document of the inventory is addressed: by its value, or by one line stating that it does not state it.',
    'search adds to observations.hits; earlier hits stay. Do not repeat a query that is already in turnNotes.',
  ];
  if (!tools.length) {
    lines.push(
      'No tools are connected: actions must be [] and the answer says which evidence is missing.',
    );
  }
  if (input.rules?.length) {
    lines.push('Rules:');
    for (const r of input.rules) lines.push(`- [${r.id}] ${r.body}`);
  }
  if (input.skills?.length) {
    lines.push('Skills:');
    for (const s of input.skills) lines.push(`- [${s.id}] ${s.body}`);
  }
  if (input.operatorPrompt?.trim()) {
    lines.push('Operator instructions:', input.operatorPrompt.trim());
  }
  lines.push('Tools:');
  for (const t of tools) {
    lines.push(`- ${t.id}: ${t.description}`);
  }
  return lines.join('\n');
}

export function buildAgentUserPrompt(input: {
  message: string;
  history?: unknown;
  observations: AgentObservations;
}): string {
  const hits = input.observations.hits ?? [];
  return JSON.stringify(
    {
      message: input.message,
      history: input.history ?? [],
      observations: {
        frame: input.observations.frame ?? null,
        inventory: input.observations.inventory ?? null,
        verdict: input.observations.verdict ?? null,
        draftAnswer: input.observations.draftAnswer ?? '',
        plan: input.observations.plan ?? [],
        goals: input.observations.goals ?? [],
        hits: hits.map((h) => ({
          chunkId: h.chunkId,
          docId: h.docId,
          score: h.score,
          headingPath: h.headingPath,
          text: h.text.slice(0, 600),
        })),
        context: (input.observations.context ?? '').slice(0, 8000),
        ontologyContext: (input.observations.ontologyContext ?? '').slice(
          0,
          4000,
        ),
        graphContext: (input.observations.graphContext ?? '').slice(0, 4000),
      },
    },
    null,
    2,
  );
}

function readActions(payload: AgentTurnLlmPayload): AgentAction[] {
  const out: AgentAction[] = [];
  if (Array.isArray(payload.actions)) {
    for (const item of payload.actions) {
      if (typeof item === 'string') {
        const id = item.trim().toLowerCase();
        if (id) out.push({ id });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const row = item as { id?: unknown; tool?: unknown; query?: unknown };
      const id = String(row.id ?? row.tool ?? '')
        .trim()
        .toLowerCase();
      if (!id) continue;
      out.push({ id, query: cleanString(row.query, 400) });
    }
    return out;
  }
  const single = cleanString(payload.action, 60)?.toLowerCase();
  if (single) out.push({ id: single, query: cleanString(payload.query, 400) });
  return out;
}

/**
 * Keeps the actions whose id is a connected tool, in the model's order.
 * Unknown ids and the answer pseudo-step are dropped, not corrected.
 */
export function parseAgentTurn(input: {
  payload: AgentTurnLlmPayload;
  observations: AgentObservations | SearchHit[];
  allowedTools?: AgentToolSchema[];
  maxActions?: number;
}): ParsedAgentTurn {
  const observations = Array.isArray(input.observations)
    ? ({ hits: input.observations } satisfies AgentObservations)
    : input.observations;
  const tools = input.allowedTools ?? DEFAULT_AGENT_TOOLS;
  const allowed = new Set(tools.map((t) => t.id));
  const maxActions = Math.max(0, input.maxActions ?? 4);

  const actions = readActions(input.payload)
    .filter((action) => allowed.has(action.id))
    .slice(0, maxActions);
  const answer = (input.payload.answer ?? '').trim();

  const notes = [...(observations.turnNotes ?? [])];
  notes.push(
    actions.length
      ? `actions:${actions.map((a) => a.id).join(',')}`
      : answer
        ? 'actions:none'
        : 'actions:empty-turn',
  );
  const nextObs: AgentObservations = { ...observations, turnNotes: notes };
  if (answer) nextObs.draftAnswer = answer;
  if (typeof input.payload.thought === 'string' && input.payload.thought.trim()) {
    nextObs.thought = input.payload.thought.trim().slice(0, 500);
  }
  const plan = cleanStrings(input.payload.plan, 8, 200);
  if (plan.length) nextObs.plan = plan;
  const goals = cleanStrings(input.payload.goals, 8, 200);
  if (goals.length) nextObs.goals = goals;

  const hits = observations.hits ?? [];
  const byId = new Map(hits.map((h) => [h.chunkId, h]));
  const citations: Citation[] = [];
  if (answer) {
    for (const id of input.payload.citationChunkIds ?? []) {
      const hit = byId.get(id);
      if (!hit) continue;
      citations.push({
        chunkId: hit.chunkId,
        docId: hit.docId,
        headingPath: hit.headingPath,
        excerpt: hit.text.slice(0, 280),
      });
    }
  }
  return { actions, answer, citations, observations: nextObs };
}
