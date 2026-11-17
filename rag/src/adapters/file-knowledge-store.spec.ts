import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileKnowledgeStore } from './file-knowledge-store';
import type { Claim, Evidence } from '../contracts/knowledge';

describe('FileKnowledgeStore', () => {
  let dir: string;
  let store: FileKnowledgeStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rag-knowledge-'));
    store = new FileKnowledgeStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists evidence and claims under collection dir', async () => {
    const evidence: Evidence = {
      id: 'ev-1',
      text: 'рекламные расходы = 210',
      source: 'doc-a',
      observedAt: '2024-10-05T10:00:00Z',
      hash: 'abc',
    };
    await store.saveEvidence('col-1', [evidence]);
    expect(await store.listEvidence('col-1')).toEqual([evidence]);
    expect(await store.listEvidence('col-other')).toEqual([]);

    const claim: Claim = {
      claimId: 'c-1',
      subject: 'spend',
      predicate: 'amount',
      object: '210',
      observedAt: '2024-10-05T10:00:00Z',
      assertedAt: '2024-10-05T10:00:00Z',
      source: 'doc-a',
      confidence: 0.9,
      status: 'accepted',
    };
    await store.saveClaims('col-1', [claim]);
    expect(await store.listClaims('col-1')).toEqual([claim]);
  });
});
