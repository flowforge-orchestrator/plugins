import { TextDocumentParser } from './text-parser';
import { RecursiveChunker } from './recursive-chunker';
import { OpenAiCompatibleEmbedder } from './openai-embedder';
import { OpenAiCompatibleLlmJson } from './openai-llm-json';
import { OllamaReranker } from './ollama-reranker';
import { FileOntologyStore } from './file-ontology-store';
import { QdrantVectorIndex } from './qdrant-vector-index';
import { Neo4jKnowledgeGraph } from './neo4j-knowledge-graph';
import type {
  Chunker,
  DocumentParser,
  Embedder,
  KnowledgeGraph,
  LlmJson,
  OntologyStore,
  Reranker,
  VectorIndex,
} from '../internal/interfaces';

export type RagServices = {
  parser: DocumentParser;
  chunker: Chunker;
  embedder: Embedder;
  llm: LlmJson;
  reranker: Reranker;
  ontology: OntologyStore;
  vectors: VectorIndex;
  graph: KnowledgeGraph;
};

let cached: RagServices | null = null;

export function getRagServices(): RagServices {
  if (cached) return cached;
  cached = {
    parser: new TextDocumentParser(),
    chunker: new RecursiveChunker(),
    embedder: new OpenAiCompatibleEmbedder(),
    llm: new OpenAiCompatibleLlmJson(),
    reranker: new OllamaReranker(),
    ontology: new FileOntologyStore(),
    vectors: new QdrantVectorIndex(),
    graph: new Neo4jKnowledgeGraph(),
  };
  return cached;
}

/** Test helper. */
export function setRagServicesForTests(services: RagServices | null): void {
  cached = services;
}
