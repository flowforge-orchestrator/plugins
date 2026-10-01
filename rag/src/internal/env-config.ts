export type RagRuntimeConfig = {
  qdrantUrl: string;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  dataDir: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  llmBaseUrl: string;
  llmModel: string;
  /** Base URL for rerank (defaults to llmBaseUrl). */
  rerankBaseUrl: string;
  /** Dedicated small model for pointwise / native rerank. */
  rerankModel: string;
};

export function loadRagRuntimeConfig(): RagRuntimeConfig {
  const llmBaseUrl = (
    process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  return {
    qdrantUrl: (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(
      /\/$/,
      '',
    ),
    neo4jUri: process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
    neo4jUser: process.env.NEO4J_USER ?? 'neo4j',
    neo4jPassword: process.env.NEO4J_PASSWORD ?? 'rag-neo4j-local',
    dataDir: process.env.RAG_DATA_DIR ?? './.rag-data',
    embeddingBaseUrl: (
      process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, ''),
    embeddingModel:
      process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    llmBaseUrl,
    llmModel: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    rerankBaseUrl: (
      process.env.RERANK_BASE_URL ?? llmBaseUrl
    ).replace(/\/$/, ''),
    rerankModel: process.env.RERANK_MODEL ?? 'qwen3:0.6b',
  };
}
