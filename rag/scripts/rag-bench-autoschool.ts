/**
 * Autoschool corpus RAG bench: index public driving-school docs, eval gold-50.
 *
 *   tsx scripts/rag-bench-autoschool.ts
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { RagExtractExecutor } from '../src/extract/executor';
import { RagChunkExecutor } from '../src/chunk/executor';
import { RagIndexWriteExecutor } from '../src/corpus-index/write/executor';
import { RagSearchQueryExecutor } from '../src/search/query/executor';
import type { ExecContext } from '@kosolapus/plugin-ts-sdk';
import type { OntologySchema, RagChunk, SearchHit } from '../src/contracts/types';

const API_KEY = process.env.OLLAMA_API_KEY || 'ollama';
const RUN_ID = `autoschool_${Date.now()}`;
const CORPUS_DIR = join(
  __dirname,
  '../.rag-smoke-data/autoschool-corpus/text',
);
const GOLD_PATH = join(
  __dirname,
  '../.rag-smoke-data/autoschool-corpus/gold-50.json',
);

const CHUNK_CONFIGS = [
  { id: 'chunk_200_20', maxTokens: 200, overlapTokens: 20 },
  { id: 'chunk_400_40', maxTokens: 400, overlapTokens: 40 },
  { id: 'chunk_800_80', maxTokens: 800, overlapTokens: 80 },
] as const;

const SEARCH_TOP_KS = [5, 10] as const;

type GoldQ = {
  id: string;
  query: string;
  expectedDocIds: string[];
  answerHint?: string;
};

type ChunkMetrics = {
  configId: string;
  maxTokens: number;
  overlapTokens: number;
  collectionId: string;
  docCount: number;
  chunkCount: number;
  avgTokenEstimate: number;
  emptyShare: number;
  forcedCutShare: number;
  vectorsWritten: number;
  indexLatencyMs: number;
  corpusChars: number;
};

type SearchMetrics = {
  configId: string;
  queryId: string;
  query: string;
  expectedDocIds: string[];
  topK: number;
  hitAtK: number;
  mrr: number;
  precisionAtK: number;
  firstRelevantRank: number | null;
  scoreTop1: number;
  scoreMarginTop1Top2: number;
  avgHitScore: number;
  uniqueDocsInHits: number;
  contextChars: number;
  hitCount: number;
  searchLatencyMs: number;
  topDocId: string | null;
  topPreview: string;
};

function ctx<I>(inputs: I): ExecContext<I> {
  return {
    runId: RUN_ID,
    inputs,
    outputs: [],
    logger: {
      debug: () => undefined,
      info: () => undefined,
      error: (...a: unknown[]) => console.error('[error]', ...a),
    },
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function isRelevant(hitDocId: string | undefined, expected: string[]): boolean {
  if (!hitDocId) return false;
  return expected.includes(hitDocId);
}

async function main() {
  const dataRoot = join(__dirname, '../.rag-smoke-data', RUN_ID);
  mkdirSync(dataRoot, { recursive: true });

  process.env.EMBEDDING_BASE_URL =
    process.env.EMBEDDING_BASE_URL || 'http://127.0.0.1:11434/v1';
  process.env.EMBEDDING_MODEL =
    process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
  process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:16333';
  process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:17687';
  process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
  process.env.NEO4J_PASSWORD =
    process.env.NEO4J_PASSWORD || 'rag-neo4j-local';
  process.env.RAG_DATA_DIR = dataRoot;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setRagServicesForTests } = require('../src/adapters/services') as {
    setRagServicesForTests: (s: null) => void;
  };
  setRagServicesForTests(null);

  const gold = JSON.parse(readFileSync(GOLD_PATH, 'utf8')) as {
    queries: GoldQ[];
  };
  const docs = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => {
      const docId = basename(f, '.txt');
      const text = readFileSync(join(CORPUS_DIR, f), 'utf8');
      return { docId, path: f, text, chars: text.length };
    })
    .sort((a, b) => b.chars - a.chars);

  console.log(
    `corpus docs=${docs.length} chars=${docs.reduce((s, d) => s + d.chars, 0)} queries=${gold.queries.length}`,
  );
  for (const d of docs) console.log(`  - ${d.docId}: ${d.chars}`);

  const schema: OntologySchema = {
    version: 1,
    entityTypes: [],
    relationTypes: [],
  };

  const chunkMetrics: ChunkMetrics[] = [];
  const searchMetrics: SearchMetrics[] = [];

  for (const cfg of CHUNK_CONFIGS) {
    const collectionId = `${RUN_ID}_${cfg.id}`;
    console.log(`\n## index ${cfg.id} → ${collectionId}`);
    process.env.RAG_DATA_DIR = join(dataRoot, cfg.id);
    mkdirSync(process.env.RAG_DATA_DIR, { recursive: true });
    setRagServicesForTests(null);

    const tIndex0 = Date.now();
    let totalChunks = 0;
    let tokenSum = 0;
    let emptyShare = 0;
    let forcedCutShare = 0;
    let vectorsWritten = 0;

    for (const doc of docs) {
      const extracted = await new RagExtractExecutor().execute(
        ctx({ documentText: doc.text, docId: doc.docId }),
      );
      const chunked = await new RagChunkExecutor().execute(
        ctx({
          blocks: extracted.blocks,
          docId: doc.docId,
          strategy: 'recursive' as const,
          maxTokens: cfg.maxTokens,
          overlapTokens: cfg.overlapTokens,
        }),
      );
      totalChunks += chunked.chunks.length;
      tokenSum += chunked.chunks.reduce(
        (s: number, c: RagChunk) => s + (c.tokenEstimate || 0),
        0,
      );
      emptyShare += chunked.emptyShare;
      forcedCutShare += chunked.forcedCutShare;

      const written = await new RagIndexWriteExecutor().execute(
        ctx({
          chunks: chunked.chunks,
          entities: [],
          relations: [],
          schema,
          collectionId,
          docId: doc.docId,
          embeddingApiKey: API_KEY,
        }),
      );
      vectorsWritten += written.vectorsWritten + written.vectorsUpdated;
      console.log(
        `  ${doc.docId}: blocks=${extracted.blockCount} chunks=${chunked.chunks.length} vec=${written.vectorsWritten}`,
      );
    }

    chunkMetrics.push({
      configId: cfg.id,
      maxTokens: cfg.maxTokens,
      overlapTokens: cfg.overlapTokens,
      collectionId,
      docCount: docs.length,
      chunkCount: totalChunks,
      avgTokenEstimate: totalChunks ? tokenSum / totalChunks : 0,
      emptyShare: emptyShare / docs.length,
      forcedCutShare: forcedCutShare / docs.length,
      vectorsWritten,
      indexLatencyMs: Date.now() - tIndex0,
      corpusChars: docs.reduce((s, d) => s + d.chars, 0),
    });

    for (const topK of SEARCH_TOP_KS) {
      console.log(`  ## search topK=${topK}`);
      for (const q of gold.queries) {
        const t0 = Date.now();
        const out = await new RagSearchQueryExecutor().execute(
          ctx({
            query: q.query,
            collectionId,
            topK,
            embeddingApiKey: API_KEY,
          }),
        );
        const searchLatencyMs = Date.now() - t0;
        const hits = (out.hits ?? []) as SearchHit[];
        const firstIdx = hits.findIndex((h) =>
          isRelevant(h.docId, q.expectedDocIds),
        );
        const relevant = hits.filter((h) =>
          isRelevant(h.docId, q.expectedDocIds),
        );
        const scoreTop1 = hits[0]?.score ?? 0;
        const scoreTop2 = hits[1]?.score ?? scoreTop1;
        const row: SearchMetrics = {
          configId: cfg.id,
          queryId: q.id,
          query: q.query,
          expectedDocIds: q.expectedDocIds,
          topK,
          hitAtK: firstIdx >= 0 ? 1 : 0,
          mrr: firstIdx >= 0 ? 1 / (firstIdx + 1) : 0,
          precisionAtK: hits.length ? relevant.length / hits.length : 0,
          firstRelevantRank: firstIdx >= 0 ? firstIdx + 1 : null,
          scoreTop1,
          scoreMarginTop1Top2: scoreTop1 - scoreTop2,
          avgHitScore: mean(hits.map((h) => h.score ?? 0)),
          uniqueDocsInHits: new Set(hits.map((h) => h.docId)).size,
          contextChars: (out.context ?? '').length,
          hitCount: out.hitCount,
          searchLatencyMs,
          topDocId: hits[0]?.docId ?? null,
          topPreview: (hits[0]?.text ?? '').slice(0, 140).replace(/\s+/g, ' '),
        };
        searchMetrics.push(row);
      }
      const slice = searchMetrics.filter(
        (x) => x.configId === cfg.id && x.topK === topK,
      );
      console.log(
        `     Hit@${topK}=${mean(slice.map((x) => x.hitAtK)).toFixed(3)} MRR=${mean(slice.map((x) => x.mrr)).toFixed(3)} P@k=${mean(slice.map((x) => x.precisionAtK)).toFixed(3)} lat=${mean(slice.map((x) => x.searchLatencyMs)).toFixed(0)}ms`,
      );
    }
  }

  const summary = CHUNK_CONFIGS.map((c) => {
    const s = searchMetrics.filter((x) => x.configId === c.id);
    const ch = chunkMetrics.find((x) => x.configId === c.id)!;
    return {
      configId: c.id,
      maxTokens: c.maxTokens,
      overlapTokens: c.overlapTokens,
      hitRateAtK: mean(s.map((x) => x.hitAtK)),
      mrr: mean(s.map((x) => x.mrr)),
      precisionAtK: mean(s.map((x) => x.precisionAtK)),
      avgFirstRelevantRank: mean(
        s
          .map((x) => x.firstRelevantRank)
          .filter((x): x is number => x != null),
      ),
      avgScoreMargin: mean(s.map((x) => x.scoreMarginTop1Top2)),
      avgSearchLatencyMs: mean(s.map((x) => x.searchLatencyMs)),
      avgContextChars: mean(s.map((x) => x.contextChars)),
      avgUniqueDocs: mean(s.map((x) => x.uniqueDocsInHits)),
      chunkCount: ch.chunkCount,
      avgChunkTokens: ch.avgTokenEstimate,
      forcedCutShare: ch.forcedCutShare,
      indexLatencyMs: ch.indexLatencyMs,
      vectorsWritten: ch.vectorsWritten,
      missCount: s.filter((x) => x.hitAtK === 0).length,
    };
  });

  const misses = searchMetrics
    .filter((x) => x.hitAtK === 0)
    .map((x) => ({
      configId: x.configId,
      topK: x.topK,
      queryId: x.queryId,
      topDocId: x.topDocId,
      expected: x.expectedDocIds,
    }));

  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    embeddingModel: process.env.EMBEDDING_MODEL,
    docs: docs.map((d) => ({ docId: d.docId, chars: d.chars })),
    queryCount: gold.queries.length,
    chunkConfigs: CHUNK_CONFIGS,
    searchTopKs: SEARCH_TOP_KS,
    summary,
    chunkMetrics,
    searchMetrics,
    misses,
    metricDefinitions: [
      { id: 'hitRateAtK', name: 'Hit@k' },
      { id: 'mrr', name: 'MRR' },
      { id: 'precisionAtK', name: 'P@k' },
      { id: 'avgFirstRelevantRank', name: 'Avg rank' },
      { id: 'avgScoreMargin', name: 'Score margin' },
      { id: 'avgSearchLatencyMs', name: 'Search latency' },
      { id: 'avgContextChars', name: 'Context chars' },
      { id: 'avgUniqueDocs', name: 'Doc diversity' },
      { id: 'chunkCount', name: 'Chunk count' },
      { id: 'avgChunkTokens', name: 'Avg chunk tokens' },
    ],
  };

  const outPath = join(
    __dirname,
    '../.rag-smoke-data/rag-bench-autoschool.json',
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
