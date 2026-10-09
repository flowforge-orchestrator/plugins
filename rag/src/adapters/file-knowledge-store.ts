import { promises as fs } from 'fs';
import { join } from 'path';
import type { Claim, Evidence } from '../contracts/knowledge';
import type { KnowledgeCanonStore } from '../internal/interfaces';
import { loadRagRuntimeConfig } from '../internal/env-config';

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

function collectionDir(dataDir: string, collectionId: string): string {
  const safe = collectionId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(dataDir, safe);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

/**
 * Durable S0/S2 filesystem under RAG_DATA_DIR (alongside FileOntologyStore).
 * Qdrant/Neo4j remain S3 projection stores — not used here.
 */
export class FileKnowledgeStore implements KnowledgeCanonStore {
  constructor(private readonly dataDir = loadRagRuntimeConfig().dataDir) {}

  async listEvidence(collectionId: string): Promise<Evidence[]> {
    const dir = collectionDir(this.dataDir, collectionId);
    return readJson(join(dir, 'evidence.json'), [] as Evidence[]);
  }

  async saveEvidence(
    collectionId: string,
    evidence: Evidence[],
  ): Promise<void> {
    const dir = collectionDir(this.dataDir, collectionId);
    await ensureDir(dir);
    await fs.writeFile(
      join(dir, 'evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8',
    );
  }

  async listClaims(collectionId: string): Promise<Claim[]> {
    const dir = collectionDir(this.dataDir, collectionId);
    return readJson(join(dir, 'claims.json'), [] as Claim[]);
  }

  async saveClaims(collectionId: string, claims: Claim[]): Promise<void> {
    const dir = collectionDir(this.dataDir, collectionId);
    await ensureDir(dir);
    await fs.writeFile(
      join(dir, 'claims.json'),
      JSON.stringify(claims, null, 2),
      'utf8',
    );
  }
}
