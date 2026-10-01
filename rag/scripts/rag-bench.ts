/**
 * RAG param sweep + metrics on Downloads docs.
 *
 *   NODE=…/node-v22 …/tsx scripts/rag-bench.ts
 *
 * Writes JSON report to .rag-smoke-data/rag-bench-report.json then exits.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RagExtractExecutor } from '../src/extract/executor';
import { RagChunkExecutor } from '../src/chunk/executor';
import { RagIndexWriteExecutor } from '../src/corpus-index/write/executor';
import { RagSearchQueryExecutor } from '../src/search/query/executor';
import type { ExecContext } from '@kosolapus/plugin-ts-sdk';
import type { OntologySchema, RagChunk, SearchHit } from '../src/contracts/types';

const API_KEY = process.env.OLLAMA_API_KEY || 'ollama';
const RUN_ID = `bench_${Date.now()}`;

const DOCS = [
  {
    docId: 'priznaki-dokumentov',
    path: '/Users/mihailsvedkov/Downloads/признаки_документов.md',
    label: 'признаки_документов.md',
  },
  {
    docId: 'tech-wbs-06',
    path: '/Users/mihailsvedkov/Downloads/06-technical-wbs.md',
    label: '06-technical-wbs.md',
  },
] as const;

const QUERIES: Array<{ id: string; query: string; expectedDocId: string }> = [
  {
    id: 'q1',
    query: 'доверенность уполномочиваю представлять интересы',
    expectedDocId: 'priznaki-dokumentov',
  },
  {
    id: 'q2',
    query: 'признаки документа доверенность паспортные данные',
    expectedDocId: 'priznaki-dokumentov',
  },
  {
    id: 'q3',
    query: 'Technical WBS дистанционная запись T-shirt sizing',
    expectedDocId: 'tech-wbs-06',
  },
  {
    id: 'q4',
    query: 'управление своей записью клиентом WBS story',
    expectedDocId: 'tech-wbs-06',
  },
  {
    id: 'q5',
    query: 'иерархическая декомпозиция работ Confidence Volatility',
    expectedDocId: 'tech-wbs-06',
  },
];

const CHUNK_CONFIGS = [
  { id: 'chunk_200_20', maxTokens: 200, overlapTokens: 20 },
  { id: 'chunk_400_40', maxTokens: 400, overlapTokens: 40 },
  { id: 'chunk_800_80', maxTokens: 800, overlapTokens: 80 },
] as const;

const SEARCH_TOP_KS = [5, 10] as const;

type ChunkMetrics = {
  configId: string;
  maxTokens: number;
  overlapTokens: number;
  collectionId: string;
  chunkCount: number;
  avgTokenEstimate: number;
  emptyShare: number;
  forcedCutShare: number;
  vectorsWritten: number;
  indexLatencyMs: number;
  embedLatencyMs: number;
};

type SearchMetrics = {
  configId: string;
  queryId: string;
  query: string;
  expectedDocId: string;
  topK: number;
  /** 1 if expected doc appears in top-k */
  hitAtK: number;
  /** Reciprocal rank of first expected-doc hit (0 if miss) */
  mrr: number;
  /** Share of hits whose docId === expected */
  precisionAtK: number;
  /** Rank of first expected hit (1-based), null if miss */
  firstRelevantRank: number | null;
  scoreTop1: number;
  scoreMarginTop1Top2: number;
  avgHitScore: number;
  uniqueDocsInHits: number;
  contextChars: number;
  hitCount: number;
  searchLatencyMs: number;
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

function metricBundle(searches: SearchMetrics[], chunks: ChunkMetrics[]) {
  const byConfig = CHUNK_CONFIGS.map((c) => {
    const s = searches.filter((x) => x.configId === c.id);
    const ch = chunks.find((x) => x.configId === c.id)!;
    return {
      configId: c.id,
      maxTokens: c.maxTokens,
      overlapTokens: c.overlapTokens,
      // --- 10 RAG characteristics ---
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
      embedLatencyMs: ch.embedLatencyMs,
    };
  });
  return byConfig;
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

  const schema: OntologySchema = {
    version: 1,
    entityTypes: [],
    relationTypes: [],
  };

  const docTexts = DOCS.map((d) => ({
    ...d,
    text: readFileSync(d.path, 'utf8'),
  }));

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
    let embedMs = 0;

    for (const doc of docTexts) {
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

      const tEmb0 = Date.now();
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
      embedMs += Date.now() - tEmb0;
      vectorsWritten += written.vectorsWritten + written.vectorsUpdated;
      console.log(
        `  ${doc.docId}: blocks=${extracted.blockCount} chunks=${chunked.chunks.length} vectors=${written.vectorsWritten}`,
      );
    }

    const indexLatencyMs = Date.now() - tIndex0;
    const nDocs = docTexts.length;
    chunkMetrics.push({
      configId: cfg.id,
      maxTokens: cfg.maxTokens,
      overlapTokens: cfg.overlapTokens,
      collectionId,
      chunkCount: totalChunks,
      avgTokenEstimate: totalChunks ? tokenSum / totalChunks : 0,
      emptyShare: emptyShare / nDocs,
      forcedCutShare: forcedCutShare / nDocs,
      vectorsWritten,
      indexLatencyMs,
      embedLatencyMs: embedMs,
    });

    for (const topK of SEARCH_TOP_KS) {
      for (const q of QUERIES) {
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
        const firstIdx = hits.findIndex((h) => h.docId === q.expectedDocId);
        const relevant = hits.filter((h) => h.docId === q.expectedDocId);
        const scoreTop1 = hits[0]?.score ?? 0;
        const scoreTop2 = hits[1]?.score ?? scoreTop1;
        const row: SearchMetrics = {
          configId: cfg.id,
          queryId: q.id,
          query: q.query,
          expectedDocId: q.expectedDocId,
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
          topPreview: (hits[0]?.text ?? '').slice(0, 120).replace(/\s+/g, ' '),
        };
        searchMetrics.push(row);
        console.log(
          `  search topK=${topK} ${q.id}: hit=${row.hitAtK} mrr=${row.mrr.toFixed(2)} P@k=${row.precisionAtK.toFixed(2)} ${searchLatencyMs}ms`,
        );
      }
    }
  }

  const summary = metricBundle(searchMetrics, chunkMetrics);
  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    embeddingModel: process.env.EMBEDDING_MODEL,
    docs: docTexts.map((d) => ({
      docId: d.docId,
      label: d.label,
      chars: d.text.length,
    })),
    queries: QUERIES,
    chunkConfigs: CHUNK_CONFIGS,
    searchTopKs: SEARCH_TOP_KS,
    /** Per-config rollup of the 10+ characteristics */
    summary,
    chunkMetrics,
    searchMetrics,
    metricDefinitions: [
      { id: 'hitRateAtK', name: 'Hit@k', desc: 'Доля запросов, где ожидаемый docId есть в top-k' },
      { id: 'mrr', name: 'MRR', desc: 'Mean Reciprocal Rank первого релевантного хита' },
      { id: 'precisionAtK', name: 'P@k', desc: 'Доля хитов с ожидаемым docId' },
      { id: 'avgFirstRelevantRank', name: 'Avg rank', desc: 'Средний ранг первого релевантного (ниже лучше)' },
      { id: 'avgScoreMargin', name: 'Score margin', desc: 'Средний top1−top2 RRF score' },
      { id: 'avgSearchLatencyMs', name: 'Search latency', desc: 'Средняя задержка поиска, мс' },
      { id: 'avgContextChars', name: 'Context chars', desc: 'Средний размер собранного контекста' },
      { id: 'avgUniqueDocs', name: 'Doc diversity', desc: 'Среднее число уникальных docId в хитах' },
      { id: 'chunkCount', name: 'Chunk count', desc: 'Число чанков после индексации корпуса' },
      { id: 'avgChunkTokens', name: 'Avg chunk tokens', desc: 'Средняя оценка токенов чанка' },
    ],
  };

  const outPath = join(
    __dirname,
    '../.rag-smoke-data/rag-bench-report.json',
  );
  mkdirSync(join(__dirname, '../.rag-smoke-data'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
  // Neo4j driver keeps event loop alive
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
