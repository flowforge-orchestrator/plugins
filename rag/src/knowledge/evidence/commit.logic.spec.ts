import { commitEvidence } from './commit.logic';

describe('commitEvidence', () => {
  it('creates evidence with stable hash', () => {
    const first = commitEvidence({
      text: 'рекламные расходы в сентябре = 210 тыс.',
      docId: 'doc-a',
      collectionId: 'col-1',
      source: 'report-a',
      observedAt: '2024-10-05T10:00:00Z',
    });
    expect(first.duplicate).toBe(false);
    expect(first.evidence.hash).toHaveLength(64);
    expect(first.evidence.text).toContain('210');

    const second = commitEvidence({
      text: 'рекламные расходы в сентябре = 210 тыс.',
      docId: 'doc-a',
      collectionId: 'col-1',
      existing: [first.evidence],
    });
    expect(second.duplicate).toBe(true);
    expect(second.evidence.id).toBe(first.evidence.id);
  });
});
