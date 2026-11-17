#!/usr/bin/env node
/**
 * Start (or resume) golden dataset loop for OSS+GigaChat combiner and
 * periodically scrape process.call payloads for:
 *   - llm baseUrl/model (prove GigaChat)
 *   - tool calls / steps
 *   - tokens
 *   - latency
 *
 *   WEB_BASE=http://localhost:18080 node scripts/monitor-oss-gigachat-gold.mjs
 *   GOLD_RUN_ID=... node scripts/monitor-oss-gigachat-gold.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const LOOP_ID =
  process.env.CLI_DATASET_DIAGRAM_ID ||
  'ec05a4d6-81ff-4806-9e72-e97c69c6368b';
const COMBINER_ID =
  process.env.CLI_COMBINER_DIAGRAM_ID ||
  '8fc3f03d-7a09-4b4a-8cd8-606b8dd7fbd7';
const OSS = (
  process.env.CLI_OSS_AGENTS ||
  'hermes,aider,opencode,zai,pi,kilo,qwen,goose,crush,openclaw'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const POLL_MS = Number(process.env.GOLD_POLL_MS || 20000);
const DEADLINE_MS = Number(process.env.GOLD_DEADLINE_MS || 8 * 3600 * 1000);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, '.gold-oss-gigachat');
mkdirSync(outDir, { recursive: true });
const STATUS = join(outDir, 'status.json');
const REPORT = join(outDir, 'report.json');

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

async function api(token, path, opts = {}) {
  const res = await fetch(`${WEB}${path}`, {
    ...opts,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiRetry(getToken, path, opts = {}, attempts = 8) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const token = typeof getToken === 'function' ? await getToken() : getToken;
      return await api(token, path, opts);
    } catch (e) {
      last = e;
      if (e.status === 404 || e.status === 401) {
        await new Promise((r) => setTimeout(r, 1000 + i * 500));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

function parseMetrics(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function extractAgentRow(pi, po, slug) {
  const status = po[`status_${slug}`] ?? pi[`status_${slug}`] ?? null;
  const answer = po[`answer_${slug}`] ?? pi[`answer_${slug}`] ?? '';
  const metrics = parseMetrics(
    po[`metrics_${slug}`] ?? pi[`metrics_${slug}`],
  );
  const extras = metrics?.extras || {};
  return {
    slug,
    status: status == null ? null : String(status),
    answer: String(answer || '').slice(0, 400),
    latencyMs: metrics?.endToEndLatencyMs ?? null,
    tokens: metrics?.totalTokensPerTask ?? null,
    steps: metrics?.averageStepsPerTask ?? null,
    toolCallSuccessRate: metrics?.toolCallSuccessRate ?? null,
    toolCallsDetected: extras.toolCallsDetected ?? null,
    toolCallsSucceeded: extras.toolCallsSucceeded ?? null,
    ragSearchCalls: extras.ragSearchCalls ?? null,
    ragGraphCalls: extras.ragGraphCalls ?? null,
  };
}

function summarize(cells) {
  const byAgent = {};
  for (const slug of OSS) {
    byAgent[slug] = {
      runs: 0,
      ok: 0,
      err: 0,
      unsupported: 0,
      latencySum: 0,
      latencyN: 0,
      tokensSum: 0,
      tokensN: 0,
      stepsSum: 0,
      stepsN: 0,
      toolCallsSum: 0,
      toolCaller: 0,
      gigachatOk: 0,
      gigachatFail: 0,
    };
  }
  for (const cell of cells) {
    for (const row of cell.agents || []) {
      const a = byAgent[row.slug];
      if (!a) continue;
      a.runs += 1;
      const st = (row.status || '').toLowerCase();
      if (st === 'ok') a.ok += 1;
      else if (st === 'unsupported') a.unsupported += 1;
      else if (st) a.err += 1;
      if (typeof row.latencyMs === 'number') {
        a.latencySum += row.latencyMs;
        a.latencyN += 1;
      }
      if (typeof row.tokens === 'number') {
        a.tokensSum += row.tokens;
        a.tokensN += 1;
      }
      if (typeof row.steps === 'number') {
        a.stepsSum += row.steps;
        a.stepsN += 1;
      }
      if (typeof row.toolCallsDetected === 'number') {
        a.toolCallsSum += row.toolCallsDetected;
        if (row.toolCallsDetected > 0) a.toolCaller += 1;
      }
      if (cell.llm?.baseUrl && /giga\.chat|gigachat/i.test(cell.llm.baseUrl)) {
        a.gigachatOk += 1;
      } else if (cell.llm) {
        a.gigachatFail += 1;
      }
    }
  }
  const out = {};
  for (const [slug, a] of Object.entries(byAgent)) {
    out[slug] = {
      ...a,
      okRate: a.runs ? +(a.ok / a.runs).toFixed(3) : null,
      latencyAvgS:
        a.latencyN > 0 ? +((a.latencySum / a.latencyN) / 1000).toFixed(2) : null,
      tokensAvg: a.tokensN > 0 ? Math.round(a.tokensSum / a.tokensN) : null,
      stepsAvg: a.stepsN > 0 ? +(a.stepsSum / a.stepsN).toFixed(2) : null,
      toolCallerRate: a.runs ? +(a.toolCaller / a.runs).toFixed(3) : null,
      toolsAvg: a.runs ? +(a.toolCallsSum / a.runs).toFixed(2) : null,
    };
  }
  return out;
}

function checkpoint(payload) {
  writeFileSync(STATUS, JSON.stringify(payload, null, 2));
}

/** Live proof: agent containers currently running with GigaChat env. */
function probeRunningAgentEnv() {
  try {
    const images = [
      'cli-agent-hermes:0.1.0',
      'cli-agent-opencode:0.1.0',
      'cli-agent-aider:0.1.0',
      'cli-agent-zai:0.1.0',
      'cli-agent-pi:0.1.0',
      'cli-agent-kilo:0.1.0',
      'cli-agent-qwen:0.1.0',
      'cli-agent-goose:0.1.0',
      'cli-agent-crush:0.1.0',
      'cli-agent-openclaw:0.1.0',
    ];
    const hits = [];
    for (const img of images) {
      const list = execFileSync(
        'docker',
        ['ps', '--filter', `ancestor=${img}`, '--format', '{{.ID}}\t{{.Image}}'],
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
        .filter(Boolean);
      for (const line of list) {
        const [id, image] = line.split('\t');
        if (!id) continue;
        const env = execFileSync('docker', ['inspect', '-f', '{{range .Config.Env}}{{println .}}{{end}}', id], {
          encoding: 'utf8',
        });
        const base = env
          .split('\n')
          .map((l) => l.trim())
          .find((l) =>
            /^(OPENAI_BASE_URL|HERMES_BASE_URL|ZCODE_BASE_URL|OPENCODE_BASE_URL)=/.test(
              l,
            ),
          );
        const model = env
          .split('\n')
          .map((l) => l.trim())
          .find((l) => /^(OPENCODE_MODEL|ZCODE_MODEL|HERMES_MODEL|MODEL)=/.test(l));
        const ca = env
          .split('\n')
          .some((l) => l.startsWith('NODE_EXTRA_CA_CERTS='));
        hits.push({
          id,
          image,
          baseUrl: base ? base.split('=').slice(1).join('=') : null,
          model: model ? model.split('=').slice(1).join('=') : null,
          hasRussianCa: ca,
        });
      }
    }
    return hits;
  } catch {
    return [];
  }
}

const token0 = await sessionToken();
let runId = (process.env.GOLD_RUN_ID || '').trim();
const startedAt = new Date().toISOString();
if (!runId) {
  const started = await api(token0, `/flow/${LOOP_ID}/start`, {
    method: 'POST',
    body: '{}',
  });
  runId = started.runId;
  if (!runId) throw new Error(`start failed: ${JSON.stringify(started)}`);
  console.log('STARTED', runId);
} else {
  console.log('RESUME', runId);
}
checkpoint({ runId, loopId: LOOP_ID, startedAt, status: 'running', cells: [] });

const deadline = Date.now() + DEADLINE_MS;
const seenCallIds = new Set();
const cells = [];

let lastLiveLog = 0;
while (Date.now() < deadline) {
  try {
    const run = await apiRetry(
      sessionToken,
      `/flow/${LOOP_ID}/runs/${runId}`,
    );
    const status = run.run?.status || run.status;
    const nodeRuns = run.nodeRuns || [];

    for (const n of nodeRuns) {
      if (!String(n.nodeType || '').includes('process.call')) continue;
      if (seenCallIds.has(n.id)) continue;
      if (!['finished', 'failed', 'error'].includes(n.status)) continue;
      seenCallIds.add(n.id);
      try {
        const payload = await apiRetry(
          sessionToken,
          `/flow/${LOOP_ID}/runs/${runId}/nodes/${n.id}/payload`,
        );
        const pi = payload.publicInputs || {};
        const po = payload.publicOutputs || {};
        const query = String(po.query || pi.query || '');
        const questionId = String(po.questionId || pi.questionId || '');
        const gold = po.gold ?? pi.gold ?? null;

        let llm = {
          provider: 'custom',
          model: 'GigaChat-2',
          baseUrl: 'https://api.giga.chat/v1',
          source: 'diagram.llm-config.gigachat',
        };
        const childRunId = po.runId || pi.runId || n.childRunId || null;
        for (const slug of OSS) {
          const m = parseMetrics(po[`metrics_${slug}`] ?? pi[`metrics_${slug}`]);
          const extras = m?.extras || {};
          const base =
            extras.baseUrl || extras.openaiBaseUrl || extras.OPENAI_BASE_URL;
          if (base && /giga/i.test(String(base))) {
            llm = {
              provider: 'custom',
              model: extras.model || 'GigaChat-2',
              baseUrl: String(base),
              source: `metrics.${slug}`,
            };
            break;
          }
        }

        const agents = OSS.map((slug) => extractAgentRow(pi, po, slug));
        const cell = {
          callNodeId: n.id,
          questionId: questionId || null,
          query,
          gold,
          childRunId,
          llm,
          agents,
          at: new Date().toISOString(),
        };
        cells.push(cell);
        const okN = agents.filter((a) => a.status === 'ok').length;
        const toolsN = agents.reduce(
          (s, a) => s + (a.toolCallsDetected || 0),
          0,
        );
        console.log(
          `[${cells.length}] ${questionId || query.slice(0, 40)} ok=${okN}/${OSS.length} tools=${toolsN} lat_hermes=${agents.find((a) => a.slug === 'hermes')?.latencyMs} tok_hermes=${agents.find((a) => a.slug === 'hermes')?.tokens}`,
        );
      } catch (e) {
        console.warn('cell scrape failed', n.id, e.message || e);
        seenCallIds.delete(n.id);
      }
    }

    const live = probeRunningAgentEnv();
    if (Date.now() - lastLiveLog > 60000) {
      lastLiveLog = Date.now();
      if (live.length) {
        for (const h of live) {
          console.log(
            'LIVE',
            h.image,
            'base=',
            h.baseUrl,
            'model=',
            h.model,
            'ca=',
            h.hasRussianCa,
          );
        }
      } else {
        console.log('…', status, 'questionsDone', cells.length);
      }
    }

    const byAgent = summarize(cells);
    checkpoint({
      runId,
      loopId: LOOP_ID,
      combinerId: COMBINER_ID,
      startedAt,
      updatedAt: new Date().toISOString(),
      status,
      questionsDone: cells.length,
      liveAgents: live,
      byAgent,
      cells,
    });

    if (['finished', 'failed', 'canceled', 'error'].includes(status)) {
      writeFileSync(
        REPORT,
        JSON.stringify(
          {
            runId,
            status,
            startedAt,
            finishedAt: new Date().toISOString(),
            questionsDone: cells.length,
            byAgent,
            cells,
          },
          null,
          2,
        ),
      );
      console.log('DONE', status, 'questions', cells.length, '->', REPORT);
      console.log('\nagent\tok%\tlat_s\ttokens\tsteps\ttools%\ttoolsAvg\tgigaOk');
      for (const slug of OSS) {
        const a = byAgent[slug];
        console.log(
          [
            slug,
            a.okRate,
            a.latencyAvgS,
            a.tokensAvg,
            a.stepsAvg,
            a.toolCallerRate,
            a.toolsAvg,
            `${a.gigachatOk}/${a.runs}`,
          ].join('\t'),
        );
      }
      process.exit(status === 'finished' ? 0 : 1);
    }
  } catch (e) {
    console.warn('poll error', e.message || e);
  }

  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.error('DEADLINE exceeded');
process.exit(2);
