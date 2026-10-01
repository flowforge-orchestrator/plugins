import { promises as fs } from 'fs';
import { join } from 'path';
import {
  emptySchema,
  type CanonicalEntity,
  type EntityMention,
  type OntologySchema,
} from '../contracts/types';
import type { OntologyStore } from '../internal/interfaces';
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

export class FileOntologyStore implements OntologyStore {
  constructor(private readonly dataDir = loadRagRuntimeConfig().dataDir) {}

  async loadSchema(collectionId: string): Promise<OntologySchema> {
    const dir = collectionDir(this.dataDir, collectionId);
    return readJson(join(dir, 'schema.json'), emptySchema());
  }

  async saveSchema(
    collectionId: string,
    schema: OntologySchema,
  ): Promise<void> {
    const dir = collectionDir(this.dataDir, collectionId);
    await ensureDir(dir);
    await fs.writeFile(
      join(dir, 'schema.json'),
      JSON.stringify(schema, null, 2),
      'utf8',
    );
  }

  async listMentions(collectionId: string): Promise<EntityMention[]> {
    const dir = collectionDir(this.dataDir, collectionId);
    return readJson(join(dir, 'mentions.json'), [] as EntityMention[]);
  }

  async replaceMentionsForDoc(
    collectionId: string,
    docId: string,
    mentions: EntityMention[],
  ): Promise<void> {
    const dir = collectionDir(this.dataDir, collectionId);
    await ensureDir(dir);
    const existing = await this.listMentions(collectionId);
    const next = [
      ...existing.filter((m) => m.docId !== docId),
      ...mentions,
    ];
    await fs.writeFile(
      join(dir, 'mentions.json'),
      JSON.stringify(next, null, 2),
      'utf8',
    );
  }

  async listEntities(collectionId: string): Promise<CanonicalEntity[]> {
    const dir = collectionDir(this.dataDir, collectionId);
    return readJson(join(dir, 'entities.json'), [] as CanonicalEntity[]);
  }

  async saveEntities(
    collectionId: string,
    entities: CanonicalEntity[],
  ): Promise<void> {
    const dir = collectionDir(this.dataDir, collectionId);
    await ensureDir(dir);
    await fs.writeFile(
      join(dir, 'entities.json'),
      JSON.stringify(entities, null, 2),
      'utf8',
    );
  }
}
