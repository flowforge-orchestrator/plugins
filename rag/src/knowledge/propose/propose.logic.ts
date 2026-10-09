import type {
  Proposal,
  ProposalKind,
} from '../../contracts/knowledge';
import { shortId } from '../hash';

export type ProposeInput = {
  kind: ProposalKind;
  payload: Record<string, unknown>;
  evidenceId?: string;
  span?: string | { start: number; end: number };
  createdAt?: string;
};

/** Agent proposals stay candidates and never write S2. */
export function createProposal(input: ProposeInput): Proposal {
  const createdAt = input.createdAt?.trim() || new Date().toISOString();
  return {
    proposalId: shortId(`prop:${input.kind}:${createdAt}:${JSON.stringify(input.payload).slice(0, 80)}`),
    kind: input.kind,
    status: 'candidate',
    payload: input.payload,
    evidenceId: input.evidenceId,
    span: input.span,
    createdAt,
  };
}

export function proposeClaim(input: {
  subject: string;
  predicate: string;
  object: string;
  evidenceId?: string;
  span?: string | { start: number; end: number };
  validFrom?: string;
  validTo?: string;
}): Proposal {
  return createProposal({
    kind: 'propose.claim',
    evidenceId: input.evidenceId,
    span: input.span,
    payload: {
      subject: input.subject,
      predicate: input.predicate,
      object: input.object,
      validFrom: input.validFrom,
      validTo: input.validTo,
    },
  });
}

export function proposeRelation(input: {
  typeId: string;
  fromEntityId: string;
  toEntityId: string;
  evidenceId?: string;
  span?: string | { start: number; end: number };
}): Proposal {
  return createProposal({
    kind: 'propose.relation',
    evidenceId: input.evidenceId,
    span: input.span,
    payload: {
      typeId: input.typeId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
    },
  });
}

export function proposeConcept(input: {
  name: string;
  aliases?: string[];
  definition?: string;
  evidenceId?: string;
  span?: string | { start: number; end: number };
}): Proposal {
  return createProposal({
    kind: 'propose.concept',
    evidenceId: input.evidenceId,
    span: input.span,
    payload: {
      name: input.name,
      aliases: input.aliases ?? [],
      definition: input.definition,
    },
  });
}

export function proposeAlias(input: {
  kind: 'entity' | 'concept';
  targetId: string;
  alias: string;
  evidenceId?: string;
  span?: string | { start: number; end: number };
}): Proposal {
  return createProposal({
    kind: 'propose.alias',
    evidenceId: input.evidenceId,
    span: input.span,
    payload: {
      kind: input.kind,
      targetId: input.targetId,
      alias: input.alias,
    },
  });
}
