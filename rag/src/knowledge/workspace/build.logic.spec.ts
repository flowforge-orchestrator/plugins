import { buildWorkspace } from './build.logic';

describe('buildWorkspace', () => {
  it('records dropped counts when over budget', () => {
    const workspace = buildWorkspace({
      question: 'сколько ДРР в сентябре?',
      entities: Array.from({ length: 5 }, (_, i) => ({
        entityId: `e${i}`,
        typeId: 'Org',
        label: `E${i}`,
      })),
      claims: Array.from({ length: 3 }, (_, i) => ({
        claimId: `c${i}`,
        subject: 'advertising_cost',
        predicate: 'amount',
        object: String(i),
        observedAt: '2024-10-01T00:00:00Z',
        assertedAt: '2024-10-01T00:00:00Z',
        source: 's',
        confidence: 0.5,
        status: 'accepted' as const,
      })),
      budget: { maxEntities: 2, maxClaims: 1, maxEvidence: 10, maxConcepts: 10 },
    });
    expect(workspace.entities).toHaveLength(2);
    expect(workspace.claims).toHaveLength(1);
    expect(workspace.dropped.entities).toBe(3);
    expect(workspace.dropped.claims).toBe(2);
    expect(workspace.dropped.reasons.length).toBeGreaterThan(0);
  });
});
