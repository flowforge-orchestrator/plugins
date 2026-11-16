#!/usr/bin/env node
/**
 * Start full golden dataset loop via Process Builder MCP and wait.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/run-gold-dataset-full.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const DIAGRAM =
  process.env.CLI_DATASET_DIAGRAM_ID ||
  'ec05a4d6-81ff-4806-9e72-e97c69c6368b';
const TITLE = 'CLI agents: golden dataset loop';
const PROTOCOL = '2025-03-26';
const TIMEOUT_MS = Number(process.env.GOLD_TIMEOUT_MS || 6 * 60 * 60 * 1000);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, '.gold-dataset-run-status.json');
const REPORT = join(root, '.gold-dataset-report.json');

async function sessionToken() {
  const res = await fetch(`${WEB}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error('auth/session failed');
  return data.accessToken;
}

function parseMcpBody(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('data:')) return JSON.parse(line.slice(5).trim());
  }
  throw new Error(`unparseable MCP body: ${trimmed.slice(0, 200)}`);
}

async function openMcp(token) {
  const res = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'gold-dataset-full-run', version: '0' },
      },
    }),
  });
  const sid = res.headers.get('mcp-session-id');
  if (!sid) throw new Error('no mcp-session-id');
  await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sid,
      'mcp-protocol-version': PROTOCOL,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  return sid;
}

async function mcpCall(auth, name, args, id = 1) {
  const res = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': auth.sid,
      'mcp-protocol-version': PROTOCOL,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  if (res.status === 401) {
    console.warn('MCP 401 — refreshing session');
    auth.token = await sessionToken();
    auth.sid = await openMcp(auth.token);
    return mcpCall(auth, name, args, id);
  }
  if (!res.ok) {
    throw new Error(`MCP ${name} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = parseMcpBody(text);
  if (body.error) throw new Error(`MCP ${name}: ${JSON.stringify(body.error)}`);
  const content = body.result?.content?.[0]?.text;
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return body.result;
}

function checkpoint(payload) {
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
}

const auth = {
  token: await sessionToken(),
  sid: '',
};
auth.sid = await openMcp(auth.token);
console.log('MCP ready', TITLE, DIAGRAM);

let runId = (process.env.GOLD_RUN_ID || '').trim();
let startedAt = new Date().toISOString();
if (runId) {
  console.log('resume runId', runId);
} else {
  const started = await mcpCall(
    auth,
    'process_start',
    { diagramId: DIAGRAM, payload: {} },
    3,
  );
  runId = started.runId || started.id;
  startedAt = started.startedAt || startedAt;
  if (!runId) {
    throw new Error(`process_start failed: ${JSON.stringify(started)}`);
  }
  console.log('STARTED runId', runId, 'at', startedAt);
}
checkpoint({
  run: {
    id: runId,
    diagramId: DIAGRAM,
    status: 'running',
    startedAt,
  },
});

const deadline = Date.now() + TIMEOUT_MS;
let waited = { status: 'running' };
let callId = 4;
let lastLog = 0;
while (Date.now() < deadline) {
  const slice = Math.min(120000, Math.max(5000, deadline - Date.now()));
  waited = await mcpCall(
    auth,
    'run_wait',
    { diagramId: DIAGRAM, runId, timeoutMs: slice, pollIntervalMs: 3000 },
    callId++,
  );
  const now = Date.now();
  if (
    now - lastLog > 60000 ||
    ['finished', 'failed', 'canceled'].includes(waited.status)
  ) {
    console.log(new Date().toISOString(), 'status', waited.status);
    lastLog = now;
    checkpoint({
      run: {
        id: runId,
        diagramId: DIAGRAM,
        status: waited.status,
        startedAt,
        updatedAt: new Date().toISOString(),
      },
      lastWait: { status: waited.status, keys: Object.keys(waited || {}) },
    });
  }
  if (['finished', 'failed', 'canceled'].includes(waited.status)) break;
}

let result = waited;
if (waited.status === 'finished' && !waited.result) {
  result = await mcpCall(
    auth,
    'run_result',
    { diagramId: DIAGRAM, runId },
    callId++,
  );
}

const payload = {
  diagramId: DIAGRAM,
  runId,
  status: waited.status,
  finishedAt: new Date().toISOString(),
  result: result.result || waited.result || result,
};
writeFileSync(REPORT, JSON.stringify(payload, null, 2));
checkpoint({
  run: {
    id: runId,
    diagramId: DIAGRAM,
    status: waited.status,
    startedAt,
    finishedAt: new Date().toISOString(),
  },
});
console.log('DONE status', waited.status, 'wrote', REPORT);

const r = payload.result;
const summary = r?.summary || r?.summaryJson || r;
if (summary?.byAgent) {
  console.log('=== byAgent ===');
  for (const [agent, s] of Object.entries(summary.byAgent)) {
    console.log(
      agent,
      'ok%',
      s.okRate,
      'mcqGold',
      s.mcqGold,
      'semGold',
      s.semanticGold,
      'sense%',
      s.sensePct,
      'tools%',
      s.toolCallerRate,
      'lat',
      s.latencyAvgS,
      'err',
      s.err,
    );
  }
} else if (summary?.matrix || r?.matrix) {
  console.log('got matrix; keys', Object.keys(summary || r || {}));
} else {
  const keys = r && typeof r === 'object' ? Object.keys(r) : [];
  console.log('result keys', keys.slice(0, 40));
}
