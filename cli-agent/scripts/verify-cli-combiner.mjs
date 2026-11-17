#!/usr/bin/env node
/**
 * Verify combiner via Conveyor Process Builder MCP only (no agent mocks).
 * Starts the published process, waits for finish, prints metrics summary table
 * from system.output (summaryJson / metrics_* ports).
 *
 *   WEB_BASE=http://localhost:18080 node scripts/verify-cli-combiner.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const TITLE = 'CLI agents: tools+skills combiner';
const PROTOCOL = '2025-03-26';
const TIMEOUT_MS = Number(process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || 900000);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../.combiner-verify-results.json');

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
    if (line.startsWith('data:')) {
      return JSON.parse(line.slice(5).trim());
    }
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
        clientInfo: { name: 'verify-cli-combiner', version: '0' },
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
    // Long sequential runs outlive a single session token — re-auth and retry once.
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

function rowsFromResult(result) {
  const out = result?.result || result || {};
  const rows = [];
  const bag = {};
  for (const [key, raw] of Object.entries(out)) {
    if (!key.startsWith('metrics_')) continue;
    const slug = key.slice('metrics_'.length).replace(/_/g, '-');
    let m = {};
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    } catch {
      m = {};
    }
    bag[slug] = m;
    const ex = m.extras || {};
    const statusKey = `status_${key.slice('metrics_'.length)}`;
    const answerKey = `answer_${key.slice('metrics_'.length)}`;
    rows.push({
      slug: ex.agentSlug || slug,
      status: ex.status ?? out[statusKey] ?? null,
      exitCode: ex.exitCode ?? null,
      latencyMs: m.endToEndLatencyMs ?? null,
      tokens: m.totalTokensPerTask ?? null,
      taskSuccess: m.taskSuccessRate ?? null,
      answerRelevance: m.answerRelevance ?? null,
      answer: ex.answerText ?? out[answerKey] ?? null,
      toolCalls: ex.toolCallsDetected ?? null,
      freestyle: ex.freestyleCodingSignals ?? null,
      usageKnown: ex.usageKnown ?? null,
    });
  }
  rows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return {
    rows,
    ok: rows.filter((r) => r.status === 'ok').length,
    total: rows.length,
    summaryJson: bag,
  };
}

function printTable(summary) {
  const rows = summary.rows || [];
  console.log(
    '| agent | status | success | relevance | answer | latencyMs | tokens | tools |',
  );
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const ans = String(r.answer ?? '')
      .replace(/\|/g, '/')
      .slice(0, 40);
    console.log(
      `| ${r.slug} | ${r.status} | ${r.taskSuccess} | ${r.answerRelevance} | ${ans} | ${r.latencyMs} | ${r.tokens} | ${r.toolCalls} |`,
    );
  }
  console.log(`\nOK ${summary.ok}/${summary.total}`);
}

async function main() {
  const auth = {
    token: await sessionToken(),
    sid: '',
  };
  auth.sid = await openMcp(auth.token);

  const listed = await mcpCall(auth, 'process_list', {}, 2);
  const items = Array.isArray(listed)
    ? listed
    : listed?.processes || listed?.items || [];
  const proc = items.find(
    (p) => (p.title || p.name || p.settings?.name) === TITLE,
  );
  if (!proc?.id) {
    throw new Error(`process not found: ${TITLE}`);
  }
  const diagramId =
    process.env.CLI_COMBINER_DIAGRAM_ID?.trim() || proc.id;
  console.log('diagramId', diagramId);

  let runId = (process.env.CLI_COMBINER_RUN_ID || '').trim();
  if (runId) {
    console.log('resume runId', runId);
  } else {
    const query = (process.env.CLI_COMBINER_QUERY || '').trim();
    const started = await mcpCall(
      auth,
      'process_start',
      { diagramId, payload: query ? { query } : {} },
      3,
    );
    runId = started.runId || started.id;
    if (!runId) {
      throw new Error(`process_start failed: ${JSON.stringify(started)}`);
    }
    console.log('runId', runId);
  }

  // MCP run_wait may return early "timeout" while the run is still going;
  // keep polling until finished/failed/canceled or wall clock expires.
  const deadline = Date.now() + TIMEOUT_MS;
  let waited = { status: 'running' };
  let callId = 4;
  while (Date.now() < deadline) {
    const slice = Math.min(120000, Math.max(5000, deadline - Date.now()));
    waited = await mcpCall(
      auth,
      'run_wait',
      { diagramId, runId, timeoutMs: slice, pollIntervalMs: 2000 },
      callId,
    );
    callId += 1;
    console.log('run status', waited.status);
    if (
      waited.status === 'finished' ||
      waited.status === 'failed' ||
      waited.status === 'canceled'
    ) {
      break;
    }
  }

  let result = waited;
  if (waited.status === 'finished' && !waited.result) {
    result = await mcpCall(
      auth,
      'run_result',
      { diagramId, runId },
      callId,
    );
  }

  const summary = rowsFromResult(result);
  if (typeof result?.result?.summaryMarkdown === 'string') {
    console.log(result.result.summaryMarkdown);
  } else if (typeof waited?.result?.summaryMarkdown === 'string') {
    console.log(waited.result.summaryMarkdown);
  } else {
    printTable(summary);
  }

  const payload = {
    diagramId,
    runId,
    status: waited.status,
    summary,
    result: result.result || waited.result || result,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log('wrote', OUT);

  if (waited.status !== 'finished' || summary.ok < summary.total) {
    process.exitCode = 1;
  } else {
    console.log('COMBINER_VERIFY_PASS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
