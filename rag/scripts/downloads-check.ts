/**
 * One-shot: index 2 Downloads docs into RAG stores, then search.
 * Env: QDRANT_URL, NEO4J_*, EMBEDDING_*, LLM_* (optional), RAG_DATA_DIR
 */
import { mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { RagExtractExecutor } from '../src/extract/executor';
import { RagChunkExecutor } from '../src/chunk/executor';
import { RagIndexWriteExecutor } from '../src/corpus-index/write/executor';
import { RagSearchQueryExecutor } from '../src/search/query/executor';
import type { ExecContext } from '@kosolapus/plugin-ts-sdk';
import type { OntologySchema } from '../src/contracts/types';

const API_KEY = process.env.OLLAMA_API_KEY || 'ollama';
const COLLECTION = process.env.RAG_COLLECTION || `downloads_check_${Date.now()}`;

const DOCS = [
  {
    docId: 'priznaki-dokumentov',
    path: '/Users/mihailsvedkov/Downloads/признаки_документов.md',
  },
  {
    docId: 'tech-wbs-06',
    path: '/Users/mihailsvedkov/Downloads/06-technical-wbs.md',
  },
];

function ctx<I>(inputs: I): ExecContext<I> {
  return {
    runId: 'downloads-check',
    inputs,
    outputs: [],
    logger: {
      debug: () => undefined,
      info: (...a: unknown[]) => console.log('[info]', ...a),
      error: (...a: unknown[]) => console.error('[error]', ...a),
    },
  };
}

async function main() {
  const dataDir = join(__dirname, '../.rag-smoke-data', COLLECTION);
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });

  process.env.EMBEDDING_BASE_URL =
    process.env.EMBEDDING_BASE_URL || 'http://127.0.0.1:11434/v1';
  process.env.EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
  process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:16333';
  process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:17687';
  process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
  process.env.NEO4J_PASSWORD =
    process.env.NEO4J_PASSWORD || 'rag-neo4j-local';
  process.env.RAG_DATA_DIR = dataDir;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setRagServicesForTests } = require('../src/adapters/services') as {
    setRagServicesForTests: (s: null) => void;
  };
  setRagServicesForTests(null);

  const schema: OntologySchema = {
    version: 1,
    entityTypes: [],
    relationTypes: [],
  };

  console.log('collection=', COLLECTION);

  for (const doc of DOCS) {
    const text = readFileSync(doc.path, 'utf8');
    console.log(`\n=== index ${doc.docId} (${text.length} chars) ===`);
    const extracted = await new RagExtractExecutor().execute(
      ctx({ documentText: text, docId: doc.docId }),
    );
    console.log('extract blocks=', extracted.blockCount);

    const chunked = await new RagChunkExecutor().execute(
      ctx({
        blocks: extracted.blocks,
        docId: doc.docId,
        strategy: 'recursive',
        maxTokens: 400,
        overlapTokens: 40,
      }),
    );
    console.log('chunks=', chunked.chunks.length);

    const written = await new RagIndexWriteExecutor().execute(
      ctx({
        chunks: chunked.chunks,
        entities: [],
        relations: [],
        schema,
        collectionId: COLLECTION,
        docId: doc.docId,
        embeddingApiKey: API_KEY,
      }),
    );
    console.log('index.write', {
      vectorsWritten: written.vectorsWritten,
      vectorsUpdated: written.vectorsUpdated,
      embeddingModel: written.embeddingModel,
    });
  }

  const queries = [
    'доверенность уполномочиваю представлять интересы',
    'Technical WBS дистанционная запись T-shirt sizing',
  ];

  for (const query of queries) {
    console.log(`\n=== search: ${query} ===`);
    const out = await new RagSearchQueryExecutor().execute(
      ctx({
        query,
        collectionId: COLLECTION,
        topK: 5,
        embeddingApiKey: API_KEY,
      }),
    );
    console.log('hitCount=', out.hitCount);
    for (const h of out.hits.slice(0, 3)) {
      const text = typeof h === 'object' && h && 'text' in h ? String((h as { text: string }).text) : JSON.stringify(h);
      const score = typeof h === 'object' && h && 'score' in h ? (h as { score: number }).score : undefined;
      const docId = typeof h === 'object' && h && 'docId' in h ? (h as { docId: string }).docId : undefined;
      console.log('-', { docId, score, preview: text.slice(0, 160).replace(/\n/g, ' ') });
    }
    if (out.hitCount < 1) {
      throw new Error(`No hits for query: ${query}`);
    }
  }

  console.log('\nOK downloads RAG check passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
