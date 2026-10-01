import type { Evidence, ResearchClaim, SlotProposal } from './model';
import { normalizeProposals } from './model';

/** Fields with no supported claim and not given up. */
export function openSlots(input: {
  required: string[];
  claims: ResearchClaim[];
  unresolved: string[];
}): string[] {
  const filled = new Set(
    input.claims.filter((claim) => claim.status === 'supported').map((claim) => claim.slot),
  );
  const unresolved = new Set(input.unresolved);
  return input.required.filter((slot) => !filled.has(slot) && !unresolved.has(slot));
}

/** Records the model may quote: anything observed or computed, not an attempt marker. */
export function quotableEvidence(evidence: Evidence[], cap = 40): Evidence[] {
  return evidence
    .filter((row) => row.extractionMethod !== 'query_attempt' && row.extractionMethod !== 'inspect_schema')
    .slice(0, cap);
}

export const PROPOSE_SYSTEM_PROMPT = [
  'You fill fields of a record from the supplied text records.',
  'For each field, copy one span verbatim from exactly one record that states the value of that field.',
  'If no record states the value, leave the field out.',
  'Return JSON: {"proposals":[{"field":string,"record":string,"span":string}]}.',
  'field and record are the ids given in the input.',
  "The span must be a character-for-character substring of that record's content.",
].join('\n');

/**
 * Short ids handed to the model in place of field names and evidence ids.
 * The model returns these ids; code maps them back, so a mistyped name or
 * id can never point at the wrong record.
 */
export type SlotHandles = {
  fields: Map<string, string>;
  records: Map<string, string>;
};

export function proposePrompt(input: {
  question: string;
  fields: string[];
  evidence: Evidence[];
}): { userPrompt: string; handles: SlotHandles } {
  const fields = new Map(input.fields.map((name, i) => [`f${i + 1}`, name]));
  const records = new Map(input.evidence.map((row, i) => [`r${i + 1}`, row.id]));
  const userPrompt = JSON.stringify(
    {
      question: input.question,
      fields: [...fields].map(([id, name]) => ({ id, name })),
      records: input.evidence.map((row, i) => ({
        id: `r${i + 1}`,
        content: row.value !== undefined ? String(row.value) : row.content.slice(0, 800),
      })),
    },
    null,
    2,
  );
  return { userPrompt, handles: { fields, records } };
}

/** Maps model output back to field names and evidence ids; unknown ids are dropped. */
export function resolveProposals(raw: unknown, handles: SlotHandles): SlotProposal[] {
  if (!Array.isArray(raw)) return [];
  const fieldNames = new Set(handles.fields.values());
  const recordIds = new Set(handles.records.values());
  const out: SlotProposal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const field = String(row.field ?? row.slot ?? '').trim();
    const record = String(row.record ?? row.evidenceId ?? '').trim();
    const span = String(row.span ?? '');
    const slot = handles.fields.get(field) ?? (fieldNames.has(field) ? field : undefined);
    const evidenceId =
      handles.records.get(record) ?? (recordIds.has(record) ? record : undefined);
    if (!slot || !evidenceId || !span.trim()) continue;
    out.push({ slot, evidenceId, span });
  }
  return normalizeProposals(out);
}

/** Keeps earlier proposals, adds one new proposal per open field. */
export function mergeProposals(input: {
  existing: SlotProposal[];
  incoming: unknown;
  openFields: string[];
}): SlotProposal[] {
  const open = new Set(input.openFields);
  const taken = new Set<string>();
  const fresh = normalizeProposals(input.incoming).filter((row) => {
    if (!open.has(row.slot) || taken.has(row.slot)) return false;
    taken.add(row.slot);
    return true;
  });
  return normalizeProposals([...input.existing, ...fresh]);
}

export const CRITIC_SYSTEM_PROMPT = [
  'You check proposed field values against their source record.',
  'For each proposal decide whether the span, read within its record, states the value of the named field.',
  'A span that is about something else does not establish the field even if it appears in the record.',
  'Return JSON: {"verdicts":[{"id":string,"establishes":boolean}]} with the id of each proposal.',
].join('\n');

export function criticPrompt(input: {
  question: string;
  proposals: SlotProposal[];
  evidence: Evidence[];
}): { userPrompt: string; handles: Map<string, SlotProposal> } {
  const byId = new Map(input.evidence.map((row) => [row.id, row]));
  const handles = new Map(input.proposals.map((row, i) => [`p${i + 1}`, row]));
  const userPrompt = JSON.stringify(
    {
      question: input.question,
      proposals: [...handles].map(([id, row]) => ({
        id,
        field: row.slot,
        span: row.span,
        record: byId.get(row.evidenceId)?.content.slice(0, 800) ?? '',
      })),
    },
    null,
    2,
  );
  return { userPrompt, handles };
}

export type CriticVerdict = { slot: string; evidenceId: string; establishes: boolean };

/** Maps verdict ids back to proposals; unknown ids are dropped. */
export function resolveVerdicts(
  raw: unknown,
  handles: Map<string, SlotProposal>,
): CriticVerdict[] {
  if (!Array.isArray(raw)) return [];
  const out: CriticVerdict[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const proposal = handles.get(String(row.id ?? '').trim());
    if (!proposal) continue;
    out.push({
      slot: proposal.slot,
      evidenceId: proposal.evidenceId,
      establishes: row.establishes === true,
    });
  }
  return out;
}

const key = (slot: string, evidenceId: string): string => `${slot}\u0000${evidenceId}`;

/** Proposals that passed the span check and have no verdict yet. */
export function pendingReview(input: {
  proposals: SlotProposal[];
  claims: ResearchClaim[];
}): SlotProposal[] {
  const claimed = new Set(input.claims.map((claim) => key(claim.slot, claim.evidence[0] ?? '')));
  return input.proposals.filter(
    (row) => !row.rejected && !row.confirmed && claimed.has(key(row.slot, row.evidenceId)),
  );
}

/**
 * Applies critic verdicts to the reviewed proposals. A reviewed proposal
 * without a true verdict is rejected: the critic had it in hand and did not
 * confirm it. Claims built from a rejected proposal are dropped.
 */
export function applyVerdicts(input: {
  proposals: SlotProposal[];
  claims: ResearchClaim[];
  verdicts: CriticVerdict[];
  reviewed: SlotProposal[];
}): { proposals: SlotProposal[]; claims: ResearchClaim[] } {
  const established = new Set(
    input.verdicts.filter((row) => row.establishes).map((row) => key(row.slot, row.evidenceId)),
  );
  const reviewed = new Set(input.reviewed.map((row) => key(row.slot, row.evidenceId)));
  const proposals = input.proposals.map((row) => {
    const k = key(row.slot, row.evidenceId);
    if (!reviewed.has(k) || row.rejected || row.confirmed) return row;
    return established.has(k) ? { ...row, confirmed: true } : { ...row, rejected: true };
  });
  const rejected = new Set(
    proposals.filter((row) => row.rejected).map((row) => key(row.slot, row.evidenceId)),
  );
  const claims = input.claims.filter(
    (claim) => !rejected.has(key(claim.slot, claim.evidence[0] ?? '')),
  );
  return { proposals, claims };
}
