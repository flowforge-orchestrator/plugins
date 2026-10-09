import {
  defaultWorkspaceBudget,
  emptyWorkspaceDropped,
  type Claim,
  type Concept,
  type Entity,
  type Evidence,
  type Workspace,
  type WorkspaceBudget,
  type WorkspaceHypothesis,
} from '../../contracts/knowledge';

export type WorkspaceBuildInput = {
  question: string;
  entities?: Entity[];
  concepts?: Concept[];
  claims?: Claim[];
  evidence?: Evidence[];
  hypotheses?: WorkspaceHypothesis[];
  timeWindow?: { from?: string; to?: string };
  budget?: Partial<WorkspaceBudget>;
};

function trimList<T>(
  rows: T[],
  max: number,
): { kept: T[]; dropped: number } {
  if (rows.length <= max) return { kept: rows, dropped: 0 };
  return { kept: rows.slice(0, max), dropped: rows.length - max };
}

export function buildWorkspace(input: WorkspaceBuildInput): Workspace {
  const budget: WorkspaceBudget = {
    ...defaultWorkspaceBudget(),
    ...input.budget,
  };
  const dropped = emptyWorkspaceDropped();
  const reasons: string[] = [];

  const entities = trimList(input.entities ?? [], budget.maxEntities);
  const concepts = trimList(input.concepts ?? [], budget.maxConcepts);
  const claims = trimList(input.claims ?? [], budget.maxClaims);
  const evidence = trimList(input.evidence ?? [], budget.maxEvidence);

  dropped.entities = entities.dropped;
  dropped.concepts = concepts.dropped;
  dropped.claims = claims.dropped;
  dropped.evidence = evidence.dropped;
  if (entities.dropped) reasons.push(`entities trimmed by ${entities.dropped}`);
  if (concepts.dropped) reasons.push(`concepts trimmed by ${concepts.dropped}`);
  if (claims.dropped) reasons.push(`claims trimmed by ${claims.dropped}`);
  if (evidence.dropped) reasons.push(`evidence trimmed by ${evidence.dropped}`);
  dropped.reasons = reasons;

  return {
    question: input.question.trim(),
    entities: entities.kept,
    concepts: concepts.kept,
    claims: claims.kept,
    evidence: evidence.kept,
    hypotheses: input.hypotheses ?? [],
    timeWindow: input.timeWindow,
    budget,
    dropped,
  };
}
