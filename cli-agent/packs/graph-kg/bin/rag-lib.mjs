#!/usr/bin/env node
/**
 * Portable RAG helper for agent sandboxes (node fetch).
 * Usage: node rag-lib.mjs search|graph <query...>
 */
const BASE = process.env.CONVEYOR_API_BASE || 'http://host.docker.internal:18080';
const IDS = {
  search: process.env.CHUK_SEARCH_DIAGRAM_ID || '0ebb1a12-871c-4eb5-af51-47a7bb6ec450',
  graph: process.env.CHUK_GRAPH_DIAGRAM_ID || '229933d8-e8d0-4b94-85ac-fc7c6af216e2',
};

async function auth() {
  const res = await fetch(`${BASE}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error('auth failed');
  return data.accessToken;
}

async function run(kind, query) {
  const token = await auth();
  const diagramId = IDS[kind];
  const start = await fetch(`${BASE}/flow/${diagramId}/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const started = await start.json();
  const runId = started.runId;
  if (!runId) throw new Error(`start failed: ${JSON.stringify(started)}`);
  // Brief 404 after start is normal (run not indexed yet).
  for (let i = 0; i < 90; i += 1) {
    const st = await fetch(`${BASE}/flow/${diagramId}/runs/${runId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (st.status === 404) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const body = await st.json();
    const status = body?.run?.status;
    if (['finished', 'failed', 'canceled', 'error'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const result = await fetch(`${BASE}/flow/${diagramId}/runs/${runId}/result`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await result.json();
  const pi = data.publicInputs || data;
  if (kind === 'search') {
    const text = pi.context || pi.hits || data;
    process.stdout.write(
      typeof text === 'string' ? text.slice(0, 12000) : JSON.stringify(text, null, 2).slice(0, 12000),
    );
    return;
  }
  const text = pi.graphContext || pi.observations || data;
  process.stdout.write(String(text).slice(0, 12000));
}

const kind = process.argv[2];
const query = process.argv.slice(3).join(' ').trim();
if (!['search', 'graph'].includes(kind) || !query) {
  console.error('usage: node rag-lib.mjs search|graph <query>');
  process.exit(2);
}
run(kind, query).catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
