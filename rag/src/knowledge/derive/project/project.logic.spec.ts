import { deriveProject } from './project.logic';

describe('deriveProject', () => {
  it('counts unique affected ids without rolling back S2', () => {
    const result = deriveProject({
      affectedIds: ['c-210', 'c-210', 'ev-a'],
      projection: 'embeddings',
    });
    expect(result).toMatchObject({
      projection: 'embeddings',
      requested: 2,
      projected: 2,
      skipped: 0,
      ok: true,
    });
  });
});
