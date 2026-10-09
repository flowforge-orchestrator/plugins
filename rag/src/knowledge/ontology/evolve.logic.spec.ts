import { evolveOntology } from './evolve.logic';

describe('evolveOntology', () => {
  it('appends log entry and bumps schema version', () => {
    const result = evolveOntology({
      decision: {
        op: 'ALIAS',
        kind: 'concept',
        fromId: 'ДРР',
        toId: 'AdvertisingCostRatio',
      },
      evidenceId: 'ev1',
      currentSchemaVersion: 3,
      assertedAt: '2024-10-12T12:00:00Z',
    });
    expect(result.schemaVersion).toBe(4);
    expect(result.entry.decision.op).toBe('ALIAS');
    expect(result.entry.evidenceId).toBe('ev1');
  });
});
