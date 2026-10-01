/**
 * Smoke each RAG executor against local Ollama + host Qdrant/Neo4j.
 * Usage (from plugins/rag after build):
 *   node --require ts-node/register  # or compiled:
 *   cd plugins && node rag/scripts/smoke-executors.cjs
 */
const path = require('path');

process.env.EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL || 'http://127.0.0.1:11434/v1';
process.env.EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
process.env.LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1';
process.env.LLM_MODEL = process.env.LLM_MODEL || 'gemma4:12b-mlx';
process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j-local';
process.env.RAG_DATA_DIR =
  process.env.RAG_DATA_DIR || path.join(__dirname, '..', '.rag-smoke-data');

const API_KEY = process.env.OLLAMA_API_KEY || 'ollama';

function ctx(inputs) {
  return {
    runId: 'smoke',
    inputs,
    outputs: [],
    logger: {
      debug: () => undefined,
      info: (...a) => console.log('[info]', ...a),
      error: (...a) => console.error('[error]', ...a),
    },
  };
}

async function main() {
  // Prefer compiled JS from dist after tsc; fall back to requiring via ts-jest path.
  // We dynamically import from source via ts-node alternative: use dist after build.
  const { getRagServices, setRagServicesForTests } = require('../dist/adapters/services.js');
  // dist layout after prune only has run.cjs — so import from unbundled if present,
  // else require through a small register from src using ts-jest/register.

  console.log('env', {
    embed: process.env.EMBEDDING_MODEL,
    llm: process.env.LLM_MODEL,
    qdrant: process.env.QDRANT_URL,
    neo4j: process.env.NEO4J_URI,
    data: process.env.RAG_DATA_DIR,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
