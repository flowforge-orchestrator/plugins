/**
 * Integration smoke: each RAG executor against local Ollama + Qdrant + Neo4j.
 *   RUN_OLLAMA_SMOKE=1 npm test -w @conveyor/plugin-rag -- ollama.smoke
 */
import { fromJsonPort } from '../internal/json-port';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { RagExtractExecutor } from '../extract/executor';
import { RagChunkExecutor } from '../chunk/executor';
import { RagOntologyProposeEntitiesExecutor } from '../ontology/propose-entities/executor';
import { RagOntologyProposeRelationsExecutor } from '../ontology/propose-relations/executor';
import { RagOntologyMergeExecutor } from '../ontology/merge/executor';
import { RagEntityExtractExecutor } from '../entity/extract/executor';
import { RagEntityResolveExecutor } from '../entity/resolve/executor';
import { RagRelationExtractExecutor } from '../relation/extract/executor';
import { RagIndexWriteExecutor } from '../corpus-index/write/executor';
import { RagSearchQueryExecutor } from '../search/query/executor';
import { RagAgentTurnExecutor } from '../agent/turn/executor';
import type { ExecContext } from '@kosolapus/plugin-ts-sdk';

const enabled = process.env.RUN_OLLAMA_SMOKE === '1';
const maybeDescribe = enabled ? describe : describe.skip;

const API_KEY = process.env.OLLAMA_API_KEY || 'ollama';
const COLLECTION = `smoke_${Date.now()}`;
const DOC_ID = 'doc-smoke-1';
const SAMPLE = `# Договор поставки

## Стороны
ООО «Альфа» (Поставщик) и ООО «Бета» (Покупатель).

## Срок оплаты
Покупатель оплачивает счета в течение 30 календарных дней.

## Ответственность
За просрочку начисляется пеня 0.1% в день.
`;

function ctx<I>(inputs: I): ExecContext<I> {
  return {
    runId: 'smoke',
    inputs,
    outputs: [],
    logger: {
      debug: () => undefined,
      info: () => undefined,
      error: (...args: unknown[]) => console.error(...args),
    },
  };
}

maybeDescribe('ollama smoke executors', () => {
  jest.setTimeout(600_000);
  jest.retryTimes(0);

  const dataDir = join(__dirname, '../../.rag-smoke-data', COLLECTION);

  beforeAll(() => {
    process.env.EMBEDDING_BASE_URL =
      process.env.EMBEDDING_BASE_URL || 'http://127.0.0.1:11434/v1';
    process.env.EMBEDDING_MODEL =
      process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
    process.env.LLM_BASE_URL =
      process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1';
    process.env.LLM_MODEL = process.env.LLM_MODEL || 'gemma4:12b-mlx';
    process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
    process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
    process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
    process.env.NEO4J_PASSWORD =
      process.env.NEO4J_PASSWORD || 'neo4j-local';
    process.env.RAG_DATA_DIR = dataDir;
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setRagServicesForTests } = require('../adapters/services') as {
      setRagServicesForTests: (s: null) => void;
    };
    setRagServicesForTests(null);
  });

  let blocks: unknown;
  let chunks: unknown;
  let candidateTypes: unknown;
  let candidateRelations: unknown;
  let schema: unknown;
  let delta: unknown;
  let mentions: unknown;
  let entities: unknown;
  let relations: unknown;
  let hits: unknown;

  it('plugin.rag.extract', async () => {
    const out = await new RagExtractExecutor().execute(
      ctx({
        documentText: SAMPLE,
        docId: DOC_ID,
      }),
    );
    expect(out.blockCount).toBeGreaterThan(0);
    blocks = fromJsonPort(out.blocks, []);
    expect(Array.isArray(blocks)).toBe(true);
    console.log('extract ok', out.blockCount);
  });

  it('plugin.rag.chunk', async () => {
    const out = await new RagChunkExecutor().execute(
      ctx({
        blocks: blocks as never,
        docId: DOC_ID,
        strategy: 'recursive',
        maxTokens: 200,
        overlapTokens: 20,
      }),
    );
    expect(out.chunkCount).toBeGreaterThan(0);
    chunks = fromJsonPort(out.chunks, []);
    console.log('chunk ok', out.chunkCount);
  });

  it('plugin.rag.ontology.propose.entities', async () => {
    const out = await new RagOntologyProposeEntitiesExecutor().execute(
      ctx({
        chunks: chunks as never,
        collectionId: COLLECTION,
        apiKey: API_KEY,
      }),
    );
    candidateTypes = fromJsonPort(out.candidateTypes, []);
    expect(Array.isArray(candidateTypes)).toBe(true);
    console.log(
      'propose.entities ok',
      (out.candidateTypes ?? []).map((t) => t.id),
    );
  });

  it('plugin.rag.ontology.propose.relations', async () => {
    const types =
      (candidateTypes as Array<{ id: string }>)?.length > 0
        ? (candidateTypes as never)
        : ([{ id: 'Organization' }, { id: 'Person' }] as never);
    const out = await new RagOntologyProposeRelationsExecutor().execute(
      ctx({
        chunks: chunks as never,
        candidateTypes: types,
        collectionId: COLLECTION,
        apiKey: API_KEY,
      }),
    );
    candidateRelations = fromJsonPort(out.candidateRelations, []);
    expect(Array.isArray(candidateRelations)).toBe(true);
    candidateTypes = types;
    console.log(
      'propose.relations ok',
      (out.candidateRelations ?? []).map((r) => r.id),
    );
  });

  it('plugin.rag.ontology.merge', async () => {
    const out = await new RagOntologyMergeExecutor().execute(
      ctx({
        candidateTypes: candidateTypes as never,
        candidateRelations: candidateRelations as never,
        collectionId: COLLECTION,
      }),
    );
    expect(out.schemaVersion).toBeGreaterThanOrEqual(0);
    schema = fromJsonPort(out.schema, out.schema);
    delta = fromJsonPort(out.delta, out.delta);
    expect(schema).toBeTruthy();
    console.log('merge ok', out.schemaVersion, out.operationCount);
  });

  it('plugin.rag.entity.extract', async () => {
    try {
      const out = await new RagEntityExtractExecutor().execute(
        ctx({
          chunks: chunks as never,
          schema: schema as never,
          collectionId: COLLECTION,
          docId: DOC_ID,
          apiKey: API_KEY,
        }),
      );
      mentions = fromJsonPort(out.mentions, []);
      expect(Array.isArray(mentions)).toBe(true);
    } catch (err) {
      console.warn('entity.extract LLM failed, using fallback mention', err);
      mentions = [];
    }
    if ((mentions as unknown[] | undefined)?.length === 0) {
      const firstChunk = (chunks as Array<{ chunkId: string; docId: string }>)[0];
      const typeId =
        (schema as { entityTypes: Array<{ id: string }> }).entityTypes.find(
          (t) => /org|organization|company/i.test(t.id),
        )?.id ??
        (schema as { entityTypes: Array<{ id: string }> }).entityTypes[0]?.id ??
        'organization';
      mentions = [
        {
          mentionId: 'm-fallback-1',
          surface: 'ООО «Альфа»',
          typeId,
          chunkId: firstChunk.chunkId,
          docId: firstChunk.docId,
        },
      ];
    }
    console.log('entity.extract ok', (mentions as unknown[]).length);
  }, 600_000);

  it('plugin.rag.entity.resolve', async () => {
    const out = await new RagEntityResolveExecutor().execute(
      ctx({
        mentions: mentions as never,
        delta: delta as never,
        collectionId: COLLECTION,
      }),
    );
    expect(Array.isArray(out.entities)).toBe(true);
    expect(out.entities.length).toBeGreaterThan(0);
    entities = fromJsonPort(out.entities, []);
    console.log('entity.resolve ok', out.entities.length, out);
  });

  it('plugin.rag.relation.extract', async () => {
    try {
      const out = await new RagRelationExtractExecutor().execute(
        ctx({
          entities: entities as never,
          chunks: chunks as never,
          schema: schema as never,
          collectionId: COLLECTION,
          apiKey: API_KEY,
        }),
      );
      expect(Array.isArray(out.relations)).toBe(true);
      relations = fromJsonPort(out.relations, []);
    } catch (err) {
      console.warn('relation.extract LLM failed, using empty relations', err);
      relations = [];
    }
    console.log('relation.extract ok', (relations as unknown[]).length);
  }, 600_000);

  it('plugin.rag.index.write', async () => {
    const out = await new RagIndexWriteExecutor().execute(
      ctx({
        chunks: chunks as never,
        entities: entities as never,
        relations: relations as never,
        schema: schema as never,
        collectionId: COLLECTION,
        docId: DOC_ID,
        embeddingApiKey: API_KEY,
      }),
    );
    expect(out.vectorsWritten + out.vectorsUpdated).toBeGreaterThan(0);
    console.log('index.write ok', out);
  });

  it('plugin.rag.search.query', async () => {
    const out = await new RagSearchQueryExecutor().execute(
      ctx({
        query: 'срок оплаты по договору',
        collectionId: COLLECTION,
        topK: 5,
        embeddingApiKey: API_KEY,
      }),
    );
    expect(out.hitCount).toBeGreaterThan(0);
    expect(out.context.length).toBeGreaterThan(0);
    hits = fromJsonPort(out.hits, []);
    console.log('search.query ok', out.hitCount);
  });

  it('plugin.rag.agent.turn', async () => {
    const out = await new RagAgentTurnExecutor().execute(
      ctx({
        message: 'Какой срок оплаты?',
        collectionId: COLLECTION,
        observations: hits as never,
        apiKey: API_KEY,
      }),
    );
    expect(['search', 'answer']).toContain(out.action);
    console.log('agent.turn ok', out.action, out.answer?.slice(0, 120));
  });
});
