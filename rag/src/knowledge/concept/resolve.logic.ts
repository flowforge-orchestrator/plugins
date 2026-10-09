import type {
  Concept,
  ConceptCandidate,
  ConceptDecision,
} from '../../contracts/knowledge';
import { shortId } from '../hash';

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function aliasHit(concept: Concept, name: string): boolean {
  const n = norm(name);
  if (norm(concept.name) === n) return true;
  return (concept.aliases ?? []).some((a) => norm(a) === n);
}

export type ConceptResolveInput = {
  candidate: ConceptCandidate;
  existing: Concept[];
};

export type ConceptResolveResult = {
  decision: ConceptDecision;
  conceptId: string;
};

/**
 * Resolves a concept candidate. «ДРР» matching AdvertisingCostRatio → MATCH + alias.
 */
export function resolveConcept(input: ConceptResolveInput): ConceptResolveResult {
  const name = input.candidate.name.trim();
  const aliases = input.candidate.aliases ?? [];
  const surfaces = [name, ...aliases].filter(Boolean);

  for (const concept of input.existing) {
    for (const surface of surfaces) {
      if (!aliasHit(concept, surface)) continue;
      // Candidate primary name may become an alias on commit (e.g. «ДРР» → AdvertisingCostRatio).
      const needsAlias =
        norm(name) !== norm(concept.name) &&
        !(concept.aliases ?? []).some((a) => norm(a) === norm(name));
      return {
        decision: {
          candidateId: input.candidate.candidateId,
          kind: 'MATCH',
          conceptId: concept.conceptId,
          ...(needsAlias ? { alias: name } : {}),
        },
        conceptId: concept.conceptId,
      };
    }
  }

  for (const concept of input.existing) {
    const def = concept.definition?.trim();
    const candDef = input.candidate.definition?.trim();
    if (def && candDef && norm(def) === norm(candDef) && norm(concept.name) !== norm(name)) {
      return {
        decision: {
          candidateId: input.candidate.candidateId,
          kind: 'SUBTYPE',
          conceptId: concept.conceptId,
        },
        conceptId: concept.conceptId,
      };
    }
  }

  const conceptId = shortId(`concept:${name}:${input.candidate.candidateId}`);
  return {
    decision: {
      candidateId: input.candidate.candidateId,
      kind: 'NEW',
      conceptId,
    },
    conceptId,
  };
}
