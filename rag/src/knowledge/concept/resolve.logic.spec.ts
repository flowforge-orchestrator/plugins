import { resolveConcept } from './resolve.logic';

describe('resolveConcept', () => {
  it('matches ДРР to AdvertisingCostRatio with alias when linked by alias surface', () => {
    const matched = resolveConcept({
      candidate: {
        candidateId: 'c1',
        name: 'ДРР',
        aliases: ['AdvertisingCostRatio'],
      },
      existing: [
        {
          conceptId: 'AdvertisingCostRatio',
          name: 'AdvertisingCostRatio',
          aliases: [],
        },
      ],
    });
    expect(matched.decision).toMatchObject({
      kind: 'MATCH',
      conceptId: 'AdvertisingCostRatio',
      alias: 'ДРР',
    });
  });

  it('creates NEW when nothing matches', () => {
    const result = resolveConcept({
      candidate: { candidateId: 'c1', name: 'ДРР' },
      existing: [
        {
          conceptId: 'AdvertisingCostRatio',
          name: 'AdvertisingCostRatio',
          aliases: [],
        },
      ],
    });
    expect(result.decision.kind).toBe('NEW');
  });
});
