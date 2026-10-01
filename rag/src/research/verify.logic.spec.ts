import { verifyClaims } from './verify.logic';
import { planStep } from './step.logic';
import { aggregateEvidence } from './aggregate.logic';
import { calculateEvidence } from './calculate.logic';
import { claimsFromProposals } from './claims.logic';
import { evidenceFromHits } from './adapters';
import {
  applyVerdicts,
  mergeProposals,
  openSlots,
  pendingReview,
} from './slot.logic';
import { safetyCheck } from './safety.logic';
import type { Evidence, ResearchClaim, SlotProposal } from './model';

function observation(id: string, content: string, location = 'doc'): Evidence {
  return {
    id,
    source: 'collection',
    location,
    content,
    extractionMethod: 'query',
    parentEvidence: [],
    reliability: 'recorded',
    kind: 'observation',
  };
}

function proposal(slot: string, evidenceId: string, span: string): SlotProposal {
  return { slot, evidenceId, span };
}

describe('verify claims', () => {
  it('Zero: no claims is not sufficient', () => {
    const result = verifyClaims({ claims: [], evidence: [] });
    expect(result.sufficient).toBe(false);
    expect(result.consistent).toBe(true);
  });

  it('One: a claim whose span lies in its evidence is supported', () => {
    const evidence = [observation('e1', 'alpha beta')];
    const [claim] = claimsFromProposals({ evidence, proposals: [proposal('f', 'e1', 'alpha')] });
    const result = verifyClaims({ claims: [claim], evidence });
    expect(result.claims[0].status).toBe('supported');
    expect(result.sufficient).toBe(true);
  });

  it('Many: two locations keep their own values', () => {
    const evidence = [observation('a', '1', 'left'), observation('b', '2', 'right')];
    const claims = claimsFromProposals({
      evidence,
      proposals: [proposal('f', 'a', '1'), proposal('f', 'b', '2')],
    });
    const result = verifyClaims({ claims, evidence });
    expect(result.consistent).toBe(true);
    expect(result.claims.every((claim) => claim.status === 'supported')).toBe(true);
  });

  it('Boundary: a derived value without parents is not supported', () => {
    const derived: Evidence = {
      id: 'd',
      source: 'aggregate',
      location: '',
      content: '3',
      extractionMethod: 'aggregate:count',
      parentEvidence: [],
      reliability: 'computed',
      kind: 'derived',
      value: 3,
    };
    const claim: ResearchClaim = {
      id: 'c',
      text: '3',
      evidence: ['d'],
      status: 'candidate',
      kind: 'derived',
      slot: 'evidence',
      fact: 'aggregate:count',
      value: '3',
    };
    const result = verifyClaims({ claims: [claim], evidence: [derived] });
    expect(result.claims[0].status).toBe('insufficient');
    expect(result.gaps.map((gap) => gap.kind)).toContain('missing_parent');
  });

  it('Exception: a hypothesis claim is never supported', () => {
    const evidence = [observation('e1', 'alpha')];
    const claim: ResearchClaim = {
      id: 'h',
      text: 'alpha caused it',
      evidence: ['e1'],
      status: 'candidate',
      kind: 'hypothesis',
      slot: 'cause',
      fact: 'cause',
      value: 'alpha',
    };
    const result = verifyClaims({ claims: [claim], evidence });
    expect(result.claims[0].status).toBe('insufficient');
    expect(result.sufficient).toBe(false);
  });

  it('Many: a span fills its field and leaves the other field open', () => {
    const evidence = [
      { ...observation('doc:1', 'title', 'd1'), extractionMethod: 'inspect_schema' },
      observation('c0', 'alpha beta', 'd1'),
      observation('c1', 'gamma delta', 'd1'),
    ];
    const task = {
      question: 'q',
      mode: 'retrieval' as const,
      requiredInformation: ['f1', 'f2'],
      unresolvedQuestions: [],
    };
    const claims = claimsFromProposals({ evidence, proposals: [proposal('f1', 'c0', 'alpha')] });
    const result = verifyClaims({ claims, evidence, task });
    expect(claims.map((claim) => claim.slot)).toEqual(['f1']);
    expect(result.consistent).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.gaps).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missing_slot', slot: 'f2' })]),
    );
  });

  it('Exception: two values for one fact at one location are contradicted', () => {
    const evidence = [observation('a', '1', 'same'), observation('b', '2', 'same')];
    const claims = claimsFromProposals({
      evidence,
      proposals: [proposal('amount', 'a', '1'), proposal('amount', 'b', '2')],
    });
    const result = verifyClaims({ claims, evidence });
    expect(result.consistent).toBe(false);
    expect(result.claims.every((claim) => claim.status === 'contradicted')).toBe(true);
  });

  it('keeps a hypothesis labelled and does not promote it', () => {
    const evidence = [observation('e1', 'alpha')];
    const result = verifyClaims({
      claims: [],
      evidence,
      hypotheses: [
        {
          id: 'h1',
          text: 'region changed the total',
          supportingEvidence: ['e1'],
          contradictingEvidence: [],
          status: 'open',
        },
      ],
    });
    expect(result.hypotheses[0].status).toBe('kept');
    expect(result.claims).toEqual([]);
  });
});

describe('plan step', () => {
  it('retrieval with no query evidence picks the query tool and does not call the model', () => {
    const step = planStep({
      mode: 'retrieval',
      evidenceCount: 0,
      queue: [],
      allowed: ['search', 'aggregate'],
      queryTool: 'search',
      question: 'q',
    });
    expect(step).toMatchObject({ op: 'search', callModel: false });
  });

  it('retrieval queries the next open field and does not call the model', () => {
    const step = planStep({
      mode: 'retrieval',
      evidenceCount: 3,
      queue: [],
      allowed: ['search'],
      queryTool: 'search',
      question: 'q',
      fields: { required: ['f1', 'f2'], filled: [], asked: [], unresolved: [] },
    });
    expect(step).toMatchObject({ op: 'search', query: 'f1', callModel: false, giveUp: [] });
  });

  it('retrieval gives up a field that was asked and still has no accepted claim', () => {
    const step = planStep({
      mode: 'retrieval',
      evidenceCount: 1,
      queue: [],
      allowed: ['search'],
      queryTool: 'search',
      question: 'q',
      fields: { required: ['f1'], filled: [], asked: ['f1'], unresolved: [] },
    });
    expect(step.op).toBe('none');
    expect(step.callModel).toBe(false);
    expect(step.giveUp).toEqual(['f1']);
  });

  it('retrieval never gives up a field before it was asked', () => {
    const step = planStep({
      mode: 'retrieval',
      evidenceCount: 1,
      queue: [],
      allowed: [],
      queryTool: '',
      question: 'q',
      fields: { required: ['f1'], filled: [], asked: [], unresolved: [] },
    });
    expect(step.giveUp).toEqual([]);
  });

  it('retrieval after a query stops', () => {
    const step = planStep({
      mode: 'retrieval',
      evidenceCount: 1,
      queue: [],
      allowed: ['search'],
      queryTool: 'search',
      question: 'q',
    });
    expect(step.op).toBe('none');
    expect(step.callModel).toBe(false);
  });

  it('analysis calls the model only when the queue is empty', () => {
    expect(
      planStep({
        mode: 'analysis',
        evidenceCount: 0,
        queue: [],
        allowed: ['search', 'aggregate'],
        queryTool: 'search',
        question: 'q',
      }).callModel,
    ).toBe(true);
    expect(
      planStep({
        mode: 'analysis',
        evidenceCount: 0,
        queue: [{ id: 'aggregate', args: { op: 'count' } }],
        allowed: ['aggregate'],
        queryTool: 'search',
        question: 'q',
      }),
    ).toMatchObject({ op: 'aggregate', callModel: false });
  });

  it('direct never queries', () => {
    expect(
      planStep({
        mode: 'direct',
        evidenceCount: 0,
        queue: [{ id: 'search' }],
        allowed: ['search'],
        queryTool: 'search',
        question: 'hi',
      }).op,
    ).toBe('none');
  });
});

describe('slot fill', () => {
  const task = {
    question: 'q',
    mode: 'retrieval' as const,
    requiredInformation: ['f1'],
    unresolvedQuestions: [],
  };

  it('Zero: hits alone are candidates and produce no claim', () => {
    const hit = { chunkId: 'c0', docId: 'd', text: 'alpha beta', score: 1, headingPath: [] };
    const evidence = evidenceFromHits({ hits: [hit], source: 'collection', field: 'f1' });
    expect(evidence.map((row) => row.extractionMethod)).toEqual(['query', 'query_attempt']);
    expect(evidence[0].group).toBeUndefined();
    expect(claimsFromProposals({ evidence, proposals: [] })).toEqual([]);
  });

  it('Zero: an empty query still records the attempt', () => {
    const evidence = evidenceFromHits({ hits: [], source: 'collection', field: 'f1' });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ extractionMethod: 'query_attempt', group: 'f1' });
  });

  it('One: a span inside its record becomes one claim on that field', () => {
    const evidence = [observation('c0', 'alpha beta')];
    const claims = claimsFromProposals({ evidence, proposals: [proposal('f1', 'c0', 'beta')] });
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ slot: 'f1', value: 'beta', evidence: ['c0'] });
  });

  it('Boundary: a span outside its record leaves the field empty', () => {
    const evidence = [observation('c0', 'alpha beta')];
    const claims = claimsFromProposals({ evidence, proposals: [proposal('f1', 'c0', 'gamma')] });
    expect(claims).toEqual([]);
    const result = verifyClaims({ claims, evidence, task });
    expect(result.complete).toBe(false);
  });

  it('Boundary: a span from a missing record or an attempt marker is not a claim', () => {
    const evidence = evidenceFromHits({ hits: [], source: 'collection', field: 'f1' });
    expect(
      claimsFromProposals({
        evidence,
        proposals: [proposal('f1', 'ask:f1', 'f1'), proposal('f1', 'nope', 'x')],
      }),
    ).toEqual([]);
  });

  it('Many: one proposal per open field; filled fields are not asked again', () => {
    const merged = mergeProposals({
      existing: [{ ...proposal('f0', 'c0', 'alpha'), confirmed: true }],
      incoming: [proposal('f1', 'c1', 'x'), proposal('f1', 'c2', 'y'), proposal('f0', 'c3', 'z')],
      openFields: ['f1'],
    });
    expect(merged).toEqual([
      { ...proposal('f0', 'c0', 'alpha'), confirmed: true },
      proposal('f1', 'c1', 'x'),
    ]);
    expect(
      openSlots({
        required: ['f0', 'f1'],
        claims: [
          { ...claimsFromProposals({ evidence: [observation('c0', 'alpha')], proposals: [proposal('f0', 'c0', 'alpha')] })[0], status: 'supported' },
        ],
        unresolved: [],
      }),
    ).toEqual(['f1']);
  });

  it('Exception: the critic rejects a span and the field stays open', () => {
    const evidence = [observation('c0', 'alpha beta')];
    const proposals = [proposal('f1', 'c0', 'beta')];
    const claims = claimsFromProposals({ evidence, proposals });
    const reviewed = pendingReview({ proposals, claims });
    expect(reviewed).toHaveLength(1);
    const applied = applyVerdicts({
      proposals,
      claims,
      verdicts: [{ slot: 'f1', evidenceId: 'c0', establishes: false }],
      reviewed,
    });
    expect(applied.claims).toEqual([]);
    expect(applied.proposals[0].rejected).toBe(true);
    expect(verifyClaims({ claims: applied.claims, evidence, task }).complete).toBe(false);
    expect(claimsFromProposals({ evidence, proposals: applied.proposals })).toEqual([]);
  });

  it('Exception: a reviewed proposal without a verdict is rejected; a confirmed one is not reviewed again', () => {
    const evidence = [observation('c0', 'alpha beta')];
    const proposals = [proposal('f1', 'c0', 'beta')];
    const claims = claimsFromProposals({ evidence, proposals });
    const applied = applyVerdicts({ proposals, claims, verdicts: [], reviewed: proposals });
    expect(applied.claims).toEqual([]);
    const confirmed = applyVerdicts({
      proposals,
      claims,
      verdicts: [{ slot: 'f1', evidenceId: 'c0', establishes: true }],
      reviewed: proposals,
    });
    expect(confirmed.proposals[0].confirmed).toBe(true);
    expect(pendingReview({ proposals: confirmed.proposals, claims: confirmed.claims })).toEqual([]);
  });
});

describe('aggregate and calculate', () => {
  const rows: Evidence[] = [
    { ...observation('a', 'x', 'g'), value: 2 },
    { ...observation('b', 'y', 'g'), value: 5 },
  ];

  it('sums a group and refuses a group without numbers', () => {
    const summed = aggregateEvidence({ evidence: rows, op: 'sum' });
    expect(summed.evidence[0].value).toBe(7);
    expect(summed.evidence[0].parentEvidence).toEqual(['a', 'b']);
    expect(aggregateEvidence({ evidence: [observation('c', 'text')], op: 'sum' }).evidence).toEqual(
      [],
    );
  });

  it('divides two records and refuses zero', () => {
    const divided = calculateEvidence({
      evidence: rows,
      op: 'div',
      leftId: 'b',
      rightId: 'a',
    });
    expect(divided.evidence[0].value).toBe(2.5);
    expect(
      calculateEvidence({
        evidence: [{ ...rows[0], value: 1 }, { ...rows[1], value: 0 }],
        op: 'div',
        leftId: 'a',
        rightId: 'b',
      }).limitation,
    ).toBe('division by zero');
  });
});

describe('safety', () => {
  it('passes an answer whose supported claims cite evidence', () => {
    const claim = claimsFromProposals({
      evidence: [observation('e', 'alpha')],
      proposals: [proposal('f', 'e', 'alpha')],
    })[0];
    claim.status = 'supported';
    expect(safetyCheck({ answer: 'alpha', claims: [claim], hypotheses: [], limitations: [] }).ok).toBe(
      true,
    );
  });

  it('replaces the answer when a hypothesis is marked supported', () => {
    const claim: ResearchClaim = {
      id: 'h',
      text: 'because',
      evidence: [],
      status: 'supported',
      kind: 'hypothesis',
      slot: 'cause',
      fact: 'cause',
      value: 'because',
    };
    const checked = safetyCheck({
      answer: 'because',
      claims: [claim],
      hypotheses: [],
      limitations: ['not established'],
    });
    expect(checked.ok).toBe(false);
    expect(checked.answer).toContain('not established');
  });
});
