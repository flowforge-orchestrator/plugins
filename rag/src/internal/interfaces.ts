import type { GraphNodeHit } from '../graph/query/query.logic';
import type {
  CanonicalEntity,
  DocBlock,
  EntityMention,
  EntityRelation,
  OntologySchema,
  RagChunk,
  SearchHit,
} from '../contracts/types';

export interface DocumentParser {
  parse(input: {
    documentText?: string;
    documentUrl?: string;
    docId: string;
  }): Promise<{ blocks: DocBlock[]; pageCoverage: number }>;
}

export type ChunkStrategy = 'recursive' | 'semantic';

export interface Chunker {
  chunk(input: {
    blocks: DocBlock[];
    docId: string;
    strategy: ChunkStrategy;
    maxTokens: number;
    overlapTokens: number;
    hardMaxTokens?: number;
  }): {
    chunks: RagChunk[];
    lengthHistogram: Record<string, number>;
    emptyShare: number;
    forcedCutShare: number;
  };
}

export interface Embedder {
  embed(texts: string[], apiKey: string): Promise<{
    vectors: number[][];
    model: string;
    dimensions: number;
    usageTokens?: number;
  }>;
}

export type LlmCompleteOptions = {
  systemPrompt: string;
  userPrompt: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  runId?: string;
};

export interface LlmJson {
  completeJson<T>(input: LlmCompleteOptions): Promise<T>;
}

export interface Reranker {
  score(input: {
    query: string;
    hits: SearchHit[];
    apiKey: string;
    systemPrompt: string;
    userPrompt: string;
    runId?: string;
  }): Promise<unknown>;
}

export interface OntologyStore {
  loadSchema(collectionId: string): Promise<OntologySchema>;
  saveSchema(collectionId: string, schema: OntologySchema): Promise<void>;
  listMentions(collectionId: string): Promise<EntityMention[]>;
  replaceMentionsForDoc(
    collectionId: string,
    docId: string,
    mentions: EntityMention[],
  ): Promise<void>;
  listEntities(collectionId: string): Promise<CanonicalEntity[]>;
  saveEntities(
    collectionId: string,
    entities: CanonicalEntity[],
  ): Promise<void>;
}

export interface VectorIndex {
  upsertChunks(input: {
    collectionId: string;
    docId: string;
    chunks: RagChunk[];
    vectors: number[][];
  }): Promise<{ written: number; updated: number; orphansRemoved: number }>;
  search(input: {
    collectionId: string;
    vector: number[];
    queryText: string;
    topK: number;
  }): Promise<SearchHit[]>;
}

export interface KnowledgeGraph {
  upsertGraph(input: {
    collectionId: string;
    docId: string;
    schema: OntologySchema;
    entities: CanonicalEntity[];
    relations: EntityRelation[];
    chunks: RagChunk[];
  }): Promise<{ entitiesWritten: number; relationsWritten: number }>;
  expand(input: {
    collectionId: string;
    query: string;
    depth: number;
  }): Promise<SearchHit[]>;
  focus(input: {
    collectionId: string;
    query: string;
  }): Promise<{ nodes: GraphNodeHit[]; context: string }>;
  listDocuments(input: {
    collectionId: string;
  }): Promise<{ docId: string; title: string }[]>;
}
