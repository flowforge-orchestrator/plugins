import type { Hypothesis, ResearchClaim } from './model';

/**
 * Last structural check before the answer leaves. It does not read the prose.
 * The answer passes when every supported claim copies evidence and no hypothesis
 * is marked supported. Otherwise the answer is the limitation list.
 */
export function safetyCheck(input: {
  answer: string;
  claims: ResearchClaim[];
  hypotheses: Hypothesis[];
  limitations: string[];
}): { answer: string; ok: boolean } {
  const broken = input.claims.filter(
    (claim) =>
      claim.status === 'supported' &&
      (claim.kind === 'hypothesis' || claim.evidence.length === 0),
  );
  if (broken.length === 0) {
    return { answer: input.answer, ok: true };
  }
  const lines = [
    ...input.limitations,
    ...input.hypotheses.map((item) => `hypothesis (${item.status}): ${item.text}`),
  ];
  return {
    answer: lines.filter(Boolean).join('\n') || 'insufficient evidence',
    ok: false,
  };
}
