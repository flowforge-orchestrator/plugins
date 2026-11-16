#!/usr/bin/env node
/**
 * Wait for hermes-only golden dataset loop, merge into .gold-dataset-report.json
 * and refresh the Q×A canvas DATA.
 *
 *   HERMES_GOLD_RUN_ID=... node scripts/wait-hermes-gold.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAnswerSemantic } from './smoke/chuk-gek/score.mjs';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const PROTOCOL = '2025-03-26';
const diagramId =
  process.env.CLI_DATASET_DIAGRAM_ID ||
  'ec05a4d6-81ff-4806-9e72-e97c69c6368b';
const runId = process.env.HERMES_GOLD_RUN_ID || '';
if (!runId) throw new Error('HERMES_GOLD_RUN_ID required');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const POLL_MS = Number(process.env.HERMES_GOLD_POLL_MS || 45000);
const DEADLINE_MS = Number(process.env.HERMES_GOLD_DEADLINE_MS || 3 * 3600 * 1000);
const CANVAS =
  process.env.GOLD_QA_CANVAS ||
  join(
    process.env.HOME || '',
    '.cursor/projects/Users-mihailsvedkov-PhpstormProjects-shift-auto-flow/canvases/gold-dataset-qa-table.canvas.tsx',
  );

function parseMcpBody(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('data:')) return JSON.parse(line.slice(5).trim());
  }
  throw new Error(`unparseable MCP body: ${trimmed.slice(0, 200)}`);
}

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
        clientInfo: { name: 'wait-hermes-gold', version: '0' },
      },
    }),
  });
  parseMcpBody(await res.text());
  const sid = res.headers.get('mcp-session-id') || '';
  await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
      ...(sid ? { 'mcp-session-id': sid } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return sid;
}

async function mcpCall(token, sid, name, args, id) {
  const res = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
      ...(sid ? { 'mcp-session-id': sid } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const body = parseMcpBody(await res.text());
  if (body.error) throw new Error(JSON.stringify(body.error));
  const text = body.result?.content?.find?.((c) => c.type === 'text')?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return body.result;
}

function parseMetrics(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function agentCell(answer, status, metrics, scored) {
  const m = parseMetrics(metrics);
  const latencyMs =
    m.endToEndLatencyMs ?? m.latencyMs ?? m.durationMs ?? null;
  const toolCalls = m.toolCallsDetected ?? m.toolCalls ?? m.tool_calls ?? 0;
  return {
    status: status || m.status || 'ok',
    answer: answer || '',
    goldScore: scored.semanticMatch || scored.match ? 1 : 0,
    latencyMs,
    toolCalls,
    ragSearch: m.ragSearch ?? 0,
    ragGraph: m.ragGraph ?? 0,
    tokens: m.tokens ?? null,
    inputTokens: m.inputTokens ?? null,
    outputTokens: m.outputTokens ?? null,
    usageKnown: m.usageKnown ?? false,
    taskSuccessRate: m.taskSuccessRate ?? null,
    answerRelevance: m.answerRelevance ?? null,
    faithfulness: m.faithfulnessGroundedness ?? m.faithfulness ?? null,
    apiErrorRate: m.apiErrorRate ?? 0,
    exitCode: m.exitCode ?? (status === 'error' ? 1 : 0),
    mcqMatch: Boolean(
      scored.matchedCue?.[0] === 'mcq-gold' || scored.mcqMatch,
    ),
    mcqPicked: scored.picked ?? null,
    semanticMatch: Boolean(scored.semanticMatch || scored.match),
    matchedCue: scored.matchedCue ?? null,
  };
}

function canvasCell(cell) {
  return {
    st: cell.status === 'ok' ? 'ok' : cell.status || 'error',
    sem: Boolean(cell.semanticMatch),
    mcq: Boolean(cell.mcqMatch),
    tools: Number(cell.toolCalls || 0),
    ms: cell.latencyMs,
    a: String(cell.answer || '').slice(0, 500),
  };
}

function rebuildCanvas(report) {
  const agents = report.summary.agents.filter((a) => a !== 'aider');
  const wall = report.summary.wall || {};
  const rows = (report.iterations || []).map((it) => ({
    id: it.questionId,
    q: it.query,
    gold: it.gold,
    call_s: Math.round((it.callLatencyMs || 0) / 1000),
    agents: Object.fromEntries(
      agents.map((slug) => {
        const a = it.agents?.[slug];
        if (!a) {
          return [slug, { st: 'missing', sem: false, mcq: false, tools: 0, ms: null, a: '' }];
        }
        return [slug, canvasCell(a)];
      }),
    ),
  }));
  const data = {
    agents,
    wall: {
      startedAt: wall.startedAt,
      finishedAt: wall.finishedAt,
      wallMs: wall.wallMs,
      wallHuman: wall.wallHuman,
    },
    model: report.summary.model || 'gemma4:12b-mlx',
    runId: report.summary.runId,
    hermesRunId: report.summary.hermesRunId,
    rows,
  };

  const src = readFileSync(CANVAS, 'utf8');
  const json = JSON.stringify(data, null, 2);
  const next = src.replace(
    /const DATA = \{[\s\S]*?\n\} as const;/,
    `const DATA = ${json} as const;`,
  );
  if (next === src) throw new Error('canvas DATA replace failed');
  writeFileSync(CANVAS, next);
  console.log('canvas updated', CANVAS);
}

async function collectCalls(token, statusPayload) {
  const calls = (statusPayload?.nodeRuns || [])
    .filter((n) => n.nodeType === 'system.process.call' && n.status === 'finished')
    .sort((a, b) => Number(a.iterationId) - Number(b.iterationId));
  const out = [];
  for (const call of calls) {
    const res = await fetch(
      `${WEB}/flow/${diagramId}/runs/${runId}/nodes/${call.id}/payload`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      throw new Error(`payload ${call.id}: HTTP ${res.status}`);
    }
    const payload = await res.json();
    const po = payload.publicOutputs || {};
    const started = call.startedAt ? Date.parse(call.startedAt) : null;
    const finished = call.finishedAt ? Date.parse(call.finishedAt) : null;
    out.push({
      iterationId: String(call.iterationId || ''),
      nodeId: call.id,
      startedAt: call.startedAt,
      finishedAt: call.finishedAt,
      latencyMs:
        started != null && finished != null ? finished - started : null,
      query: String(po.query || payload.publicInputs?.query || ''),
      answer: String(po.answer_hermes || ''),
      status: String(po.status_hermes || 'ok'),
      metrics: po.metrics_hermes,
    });
  }
  return out;
}

async function main() {
  let token = await sessionToken();
  let sid = await openMcp(token);
  let id = 10;
  const deadline = Date.now() + DEADLINE_MS;
  let status = 'running';
  let lastSt = null;

  while (Date.now() < deadline) {
    try {
      lastSt = await mcpCall(
        token,
        sid,
        'run_status',
        { diagramId, runId },
        id++,
      );
      status = lastSt?.run?.status || lastSt?.status || 'unknown';
      const calls = (lastSt?.nodeRuns || []).filter(
        (n) => n.nodeType === 'system.process.call',
      );
      const finished = calls.filter((n) => n.status === 'finished').length;
      console.log(
        new Date().toISOString(),
        status,
        `calls ${finished}/${calls.length}`,
      );
      writeFileSync(
        join(root, '.gold-hermes-run-status.json'),
        JSON.stringify(lastSt, null, 2),
      );
      if (['finished', 'failed', 'canceled', 'error'].includes(status)) break;
    } catch (e) {
      console.log('poll err', String(e?.message || e));
      token = await sessionToken();
      sid = await openMcp(token);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  console.log('FINAL', status);
  token = await sessionToken();
  const hermesCalls = await collectCalls(token, lastSt);
  writeFileSync(
    join(root, '.gold-hermes-call-payloads.json'),
    JSON.stringify(hermesCalls, null, 2),
  );
  console.log('collected', hermesCalls.length, 'hermes calls');

  const bank = JSON.parse(
    readFileSync(join(here, 'smoke/chuk-gek/questions.json'), 'utf8'),
  );
  const accept = JSON.parse(
    readFileSync(join(here, 'smoke/chuk-gek/semantic-accept.json'), 'utf8'),
  );
  const qById = Object.fromEntries(
    (bank.questions || []).map((q) => [q.id, q]),
  );
  const qByPrompt = Object.fromEntries(
    (bank.questions || []).map((q) => [String(q.prompt || '').trim(), q]),
  );

  const reportPath = join(root, '.gold-dataset-report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));

  for (const call of hermesCalls) {
    const q =
      qByPrompt[call.query.trim()] ||
      (bank.questions || []).find((qq) =>
        call.query.includes(String(qq.prompt || '').trim()),
      );
    if (!q) {
      console.log('unmatched query', call.query.slice(0, 80));
      continue;
    }
    const it = (report.iterations || []).find((x) => x.questionId === q.id);
    if (!it) continue;
    const scored = scoreAnswerSemantic(call.answer, q, accept);
    it.agents.hermes = agentCell(
      call.answer,
      call.status,
      call.metrics,
      scored,
    );
  }

  const agents = [
    'hermes',
    ...(report.summary.agents || []).filter(
      (a) => a !== 'aider' && a !== 'hermes',
    ),
  ];
  report.summary.agents = agents;
  report.summary.hermesRunId = runId;
  report.summary.hermesStatus = status;
  delete report.summary.byAgent?.aider;

  const hermesIters = (report.iterations || []).filter((it) => it.agents?.hermes);
  const semHits = hermesIters.filter((it) => it.agents.hermes.semanticMatch).length;
  if (!report.summary.byAgent) report.summary.byAgent = {};
  report.summary.byAgent.hermes = {
    questions: hermesIters.length,
    semanticHits: semHits,
    sensePct:
      hermesIters.length > 0
        ? Math.round((1000 * semHits) / hermesIters.length) / 10
        : 0,
  };

  // Drop aider from iterations for consistency with canvas
  for (const it of report.iterations || []) {
    if (it.agents?.aider) delete it.agents.aider;
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('merged hermes', hermesIters.length, 'sense', `${semHits}/${hermesIters.length}`);

  try {
    rebuildCanvas(report);
  } catch (e) {
    console.log('canvas update skipped:', String(e?.message || e));
  }

  console.log('HERMES_GOLD_DONE', status, runId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
