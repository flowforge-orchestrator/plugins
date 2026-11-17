import { interpretObservations } from './observations.logic';

describe('interpretObservations', () => {
  it('drops claim candidates whose span is outside evidence text', () => {
    const result = interpretObservations({
      evidence: {
        id: 'ev1',
        text: 'расходы 210 тыс. в сентябре',
        source: 'a',
        observedAt: '2024-10-01T00:00:00Z',
        hash: 'h',
      },
      chunks: [],
      raw: {
        claimCandidates: [
          {
            candidateId: 'ok',
            subject: 'advertising_cost',
            predicate: 'amount',
            object: '210000',
            evidenceId: 'ev1',
            span: { start: 8, end: 16 },
          },
          {
            candidateId: 'bad',
            subject: 'advertising_cost',
            predicate: 'amount',
            object: '999',
            evidenceId: 'ev1',
            span: { start: 0, end: 500 },
          },
        ],
      },
    });
    expect(result.claimCandidates.map((c) => c.candidateId)).toEqual(['ok']);
  });
});
