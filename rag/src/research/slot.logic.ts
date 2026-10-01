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
  'Return JSON: {"proposals":[{"slot":string,"evidenceId":string,"span":string}]}.',
  'The span must be a character-for-character substring of the record named by evidenceId.',
].join('\n');

export function proposeUserPrompt(input: {
  question: string;
  fields: string[];
  evidence: Evidence[];
}): string {
  return JSON.stringify(
    {
      question: input.question,
      fields: input.fields,
      records: input.evidence.map((row) => ({
        id: row.id,
        content: row.value !== undefined ? String(row.value) : row.content.slice(0, 800),
      })),
    },
    null,
    2,
  );
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
  'Return JSON: {"verdicts":[{"slot":string,"evidenceId":string,"establishes":boolean}]}.',
].join('\n');

export function criticUserPrompt(input: {
  question: string;
  proposals: SlotProposal[];
  evidence: Evidence[];
}): string {
  const byId = new Map(input.evidence.map((row) => [row.id, row]));
  return JSON.stringify(
    {
      question: input.question,
      proposals: input.proposals.map((row) => ({
        slot: row.slot,
        evidenceId: row.evidenceId,
        span: row.span,
        record: byId.get(row.evidenceId)?.content.slice(0, 800) ?? '',
      })),
    },
    null,
    2,
  );
}

export type CriticVerdict = { slot: string; evidenceId: string; establishes: boolean };

export function normalizeVerdicts(raw: unknown): CriticVerdict[] {
  if (!Array.isArray(raw)) return [];
  const out: CriticVerdict[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<CriticVerdict>;
    const slot = String(row.slot ?? '').trim();
    const evidenceId = String(row.evidenceId ?? '').trim();
    if (!slot || !evidenceId) continue;
    out.push({ slot, evidenceId, establishes: row.establishes === true });
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
