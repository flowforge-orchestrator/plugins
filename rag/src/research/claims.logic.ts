import type { Evidence, ResearchClaim, SlotProposal } from './model';

/**
 * Builds claims from proposals only. A proposal becomes a claim when its span
 * lies inside the evidence record it names. That is a provenance check, not a
 * reading of the text. Hits, schema rows, and query attempts are not claims.
 */
export function claimsFromProposals(input: {
  evidence: Evidence[];
  proposals: SlotProposal[];
}): ResearchClaim[] {
  const byId = new Map(input.evidence.map((row) => [row.id, row]));
  const out: ResearchClaim[] = [];
  const seen = new Set<string>();
  for (const proposal of input.proposals) {
    if (proposal.rejected) continue;
    const row = byId.get(proposal.evidenceId);
    if (!row || row.extractionMethod === 'query_attempt') continue;
    if (!spanInside(row, proposal.span)) continue;
    const id = `c:${proposal.slot}:${row.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text: proposal.span,
      evidence: [row.id],
      status: 'candidate',
      kind: row.kind,
      slot: proposal.slot,
      fact: proposal.slot,
      value: proposal.span,
    });
  }
  return out;
}

/** The span must be a copy of the record or the record's computed value. */
export function spanInside(row: Evidence, span: string): boolean {
  const needle = span.trim();
  if (!needle) return false;
  if (row.content.includes(needle)) return true;
  return row.value !== undefined && String(row.value) === needle;
}
