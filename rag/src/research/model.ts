/**
 * Research runtime records. A domain adapter (documents, tables, anything else)
 * only fills these. Modes, evidence, claims, and hypotheses do not name a dataset.
 */

export const RESEARCH_MODES = ['direct', 'retrieval', 'analysis', 'research'] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export type Evidence = {
  id: string;
  source: string;
  location: string;
  content: string;
  extractionMethod: string;
  parentEvidence: string[];
  reliability: 'recorded' | 'computed';
  kind: 'observation' | 'derived';
  /** Set only when a code operation produced a number. */
  value?: number;
  group?: string;
};

export type ResearchClaim = {
  id: string;
  text: string;
  evidence: string[];
  status: 'candidate' | 'supported' | 'contradicted' | 'insufficient';
  kind: 'observation' | 'derived' | 'hypothesis';
  slot: string;
  fact: string;
  value: string;
};

export type Hypothesis = {
  id: string;
  text: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  status: 'open' | 'kept' | 'dropped';
};

export type ResearchTask = {
  question: string;
  mode: ResearchMode;
  requiredInformation: string[];
  unresolvedQuestions: string[];
};

export type StepRequest = {
  id: string;
  query?: string;
  args?: Record<string, string>;
};

/**
 * A field value the model proposed: one span copied from one evidence record.
 * Code checks the span lies inside that record; the critic checks it states
 * the field. A rejected proposal stays recorded and is not proposed again.
 */
export type SlotProposal = {
  slot: string;
  evidenceId: string;
  span: string;
  confirmed?: boolean;
  rejected?: boolean;
};

const MODES = new Set<string>(RESEARCH_MODES);

export function normalizeMode(raw: unknown, fallback: ResearchMode = 'retrieval'): ResearchMode {
  const value = String(raw ?? '').trim().toLowerCase();
  return MODES.has(value) ? (value as ResearchMode) : fallback;
}

function text(raw: unknown, max: number): string {
  return String(raw ?? '').trim().slice(0, max);
}

function ids(raw: unknown, max = 12): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const id = text(item, 200);
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeEvidence(raw: unknown): Evidence | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<Evidence>;
  const id = text(row.id, 200);
  const content = text(row.content, 2000);
  if (!id || !content) return undefined;
  const kind = row.kind === 'derived' ? 'derived' : 'observation';
  const value =
    typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : undefined;
  return {
    id,
    source: text(row.source, 200) || 'unknown',
    location: text(row.location, 300),
    content,
    extractionMethod: text(row.extractionMethod, 80) || kind,
    parentEvidence: ids(row.parentEvidence),
    reliability: row.reliability === 'computed' || kind === 'derived' ? 'computed' : 'recorded',
    kind,
    ...(value !== undefined ? { value } : {}),
    ...(text(row.group, 200) ? { group: text(row.group, 200) } : {}),
  };
}

export function normalizeEvidenceList(raw: unknown, cap = 80): Evidence[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Evidence[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const evidence = normalizeEvidence(item);
    if (!evidence || seen.has(evidence.id)) continue;
    seen.add(evidence.id);
    out.push(evidence);
    if (out.length >= cap) break;
  }
  return out;
}

/** Later lists win on the same id so a derived record can replace a stub. */
export function unionEvidence(lists: Evidence[][], cap = 80): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const list of lists) {
    for (const evidence of list) {
      if (!byId.has(evidence.id) && byId.size >= cap) continue;
      byId.set(evidence.id, evidence);
    }
  }
  return [...byId.values()];
}

export function normalizeClaim(raw: unknown): ResearchClaim | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<ResearchClaim>;
  const value = text(row.value, 2000);
  const evidence = ids(row.evidence);
  if (!value || evidence.length === 0) return undefined;
  const kind =
    row.kind === 'derived' || row.kind === 'hypothesis' ? row.kind : 'observation';
  const slot = text(row.slot, 120) || 'value';
  return {
    id: text(row.id, 200) || `${evidence[0]}:${slot}`,
    text: text(row.text, 2000) || value,
    evidence,
    status:
      row.status === 'supported' ||
      row.status === 'contradicted' ||
      row.status === 'insufficient'
        ? row.status
        : 'candidate',
    kind,
    slot,
    fact: text(row.fact, 200) || slot,
    value,
  };
}

export function normalizeClaimList(raw: unknown, cap = 80): ResearchClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchClaim[] = [];
  for (const item of raw) {
    const claim = normalizeClaim(item);
    if (!claim) continue;
    out.push(claim);
    if (out.length >= cap) break;
  }
  return out;
}

export function normalizeHypothesis(raw: unknown, index: number): Hypothesis | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<Hypothesis>;
  const body = text(row.text, 500);
  if (!body) return undefined;
  const status =
    row.status === 'kept' || row.status === 'dropped' ? row.status : 'open';
  return {
    id: text(row.id, 80) || `h${index + 1}`,
    text: body,
    supportingEvidence: ids(row.supportingEvidence),
    contradictingEvidence: ids(row.contradictingEvidence),
    status,
  };
}

export function normalizeHypotheses(raw: unknown): Hypothesis[] {
  if (!Array.isArray(raw)) return [];
  const out: Hypothesis[] = [];
  for (const item of raw) {
    const hypothesis = normalizeHypothesis(item, out.length);
    if (!hypothesis) continue;
    out.push(hypothesis);
    if (out.length >= 8) break;
  }
  return out;
}

export function normalizeTask(raw: unknown): ResearchTask | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Partial<ResearchTask>;
  const question = text(row.question, 2000);
  if (!question) return undefined;
  const required = Array.isArray(row.requiredInformation)
    ? row.requiredInformation.map((s) => text(s, 120)).filter(Boolean).slice(0, 8)
    : [];
  const unresolved = Array.isArray(row.unresolvedQuestions)
    ? row.unresolvedQuestions.map((s) => text(s, 200)).filter(Boolean).slice(0, 8)
    : [];
  return {
    question,
    mode: normalizeMode(row.mode),
    requiredInformation: required,
    unresolvedQuestions: unresolved,
  };
}

function stringArgs(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = text(key, 40);
    const body = text(value, 200);
    if (!name || !body) continue;
    out[name] = body;
    if (Object.keys(out).length >= 8) break;
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizeProposals(raw: unknown, cap = 32): SlotProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: SlotProposal[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<SlotProposal>;
    const slot = text(row.slot, 120);
    const evidenceId = text(row.evidenceId, 200);
    const span = text(row.span, 2000);
    if (!slot || !evidenceId || !span) continue;
    const key = `${slot}\u0000${evidenceId}\u0000${span}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      slot,
      evidenceId,
      span,
      ...(row.confirmed === true ? { confirmed: true } : {}),
      ...(row.rejected === true ? { rejected: true } : {}),
    });
    if (out.length >= cap) break;
  }
  return out;
}

export function normalizeQueue(raw: unknown): StepRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: StepRequest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = text((item as StepRequest).id, 60).toLowerCase();
    if (!id) continue;
    const query = text((item as StepRequest).query, 400);
    const args = stringArgs((item as StepRequest).args);
    out.push({
      id,
      ...(query ? { query } : {}),
      ...(args ? { args } : {}),
    });
    if (out.length >= 8) break;
  }
  return out;
}
