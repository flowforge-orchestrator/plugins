#!/usr/bin/env node
/**
 * Run q01+q02 from the gold bank on Graph pack opensource agents.
 *
 *   node scripts/gold-pair.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRunMetrics } from '../src/agents/metrics.ts';
import { scoreAnswer } from './smoke/chuk-gek/score.mjs';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(
  readFileSync(join(here, 'smoke/chuk-gek/questions.json'), 'utf8'),
);
const questions = bank.questions.filter((q) => ['q01', 'q02'].includes(q.id));

const AGENTS = {
  hermes: {
    id: '72e7a508-4475-4024-a301-e99d9ced6899',
    provider: 'ollama',
    model: 'gemma4:12b-mlx',
    baseUrl: 'http://host.docker.internal:11434/v1',
  },
  opencode: {
    id: '3adae966-0fef-492e-82f1-396a2368e867',
    provider: 'ollama',
    model: 'gemma4:12b-mlx',
    baseUrl: 'http://host.docker.internal:11434/v1',
  },
  // aider skipped: hangs / freestyle network side-quests on litellm path
};

function buildTask(q) {
  const opts = q.options.map((o, i) => `${i + 1}) ${o}`).join('\n');
  return [
    `Коллекция знаний: ${bank.collectionId}.`,
    'Ответь номером и текстом одного варианта из списка. Без пояснений.',
    '',
    q.prompt,
    opts,
  ].join('\n');
}

/** Prefer trailing answer lines; drop session banners and box-drawing chrome. */
function answerSlice(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const resumeIdx = lines.findIndex((l) => /^Resume this session/i.test(l));
  const body = resumeIdx >= 0 ? lines.slice(0, resumeIdx) : lines;
  const tail = body.filter(
    (l) =>
      !/^[─╰╭│╮╯┌┐└┘═║╔╗╚╝]/.test(l) &&
      !/^(Session:|Title:|Duration:|Messages:|PROTOCOL|Resume this)/i.test(l) &&
      !/^##\s*(Задача|Контекст)/i.test(l) &&
      !/^(Interrupted|Sending after interrupt)/i.test(l) &&
      !/^hermes\s/i.test(l),
  );
  return (tail.slice(-8).join('\n') || '').trim();
}

function score(text, q) {
  const slice = answerSlice(text);
  if (!slice) return false;
  if (scoreAnswer(slice, q).match) return true;
  // numbered choice only at line start: "2)" or "2. В Москве"
  for (const line of slice.split(/\n/)) {
    const m = line.match(/^([1-9])\s*[).]\s*(.*)$/);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    const rest = m[2].trim();
    if (rest && scoreAnswer(rest, q).match) return true;
    if (q.options[idx] && scoreAnswer(q.options[idx], q).match) return true;
  }
  return false;
}

async function token() {
  const res = await fetch(`${WEB}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error('auth failed');
  return data.accessToken;
}

async function authFetch(path, init = {}) {
  let tok = await token();
  const once = async (t) =>
    fetch(`${WEB}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        authorization: `Bearer ${t}`,
      },
    });
  let res = await once(tok);
  if (res.status === 401) {
    tok = await token();
    res = await once(tok);
  }
  return res;
}

async function runOne(slug, agent, q) {
  const start = await authFetch(`/flow/${agent.id}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      task: buildTask(q),
      provider: agent.provider,
      model: agent.model,
      baseUrl: agent.baseUrl,
      workspace: '/var/lib/cli-agent/workspaces/graph-pack',
      timeoutMs: 600000,
    }),
  });
  const started = await start.json();
  const runId = started.runId;
  if (!runId) {
    return { slug, q: q.id, ok: false, error: JSON.stringify(started).slice(0, 200) };
  }
  let status = 'unknown';
  for (let i = 0; i < 180; i += 1) {
    const st = await authFetch(`/flow/${agent.id}/runs/${runId}`);
    const body = await st.json();
    status = body?.run?.status || 'unknown';
    if (['finished', 'failed', 'canceled', 'error'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const result = await authFetch(`/flow/${agent.id}/runs/${runId}/result`);
  const data = await result.json();
  const pi = data.publicInputs || data;
  const text = String(pi.text || pi.stdout || '');
  const stdout = String(pi.stdout || '');
  const stderr = String(pi.stderr || '');
  const ok = status === 'finished' && score(text, q);
  // metricsJson is produced by the plugin but not wired to system.output yet
  // (unknown output port races the sink). Derive the same pack from transcripts.
  const enrichedTask = `## Контекст retrieval\n`; // marker for prefetch-present heuristic
  const metrics = collectRunMetrics({
    agentSlug: slug,
    task: `${enrichedTask}${buildTask(q)}`,
    text,
    stdout: stdout || text,
    stderr,
    status: String(pi.status || status),
    exitCode: Number(pi.exitCode || 0),
    latencyMs: 0,
    usageKnown: Boolean(pi.usageKnown),
    inputTokens:
      pi.inputTokens === '' || pi.inputTokens == null
        ? undefined
        : Number(pi.inputTokens),
    outputTokens:
      pi.outputTokens === '' || pi.outputTokens == null
        ? undefined
        : Number(pi.outputTokens),
    workspaceMounted: Boolean(pi.workspaceMounted),
    taskSuccess: ok ? 1 : 0,
    structuredValid: ok ? 1 : 0,
  });
  return {
    slug,
    q: q.id,
    gold: q.gold,
    ok,
    status,
    text: text.slice(-400),
    metrics: {
      planAdherenceRate: metrics.planAdherenceRate,
      toolCallsDetected: metrics.extras.toolCallsDetected,
      freestyleCodingSignals: metrics.extras.freestyleCodingSignals,
      groundedTokenOverlap: metrics.extras.groundedTokenOverlap,
      taskSuccessRate: metrics.taskSuccessRate,
    },
  };
}

async function main() {
  const rows = [];
  for (const [slug, agent] of Object.entries(AGENTS)) {
    for (const q of questions) {
      console.log('run', slug, q.id);
      const row = await runOne(slug, agent, q);
      rows.push(row);
      console.log(JSON.stringify({ ...row, text: row.text?.slice(0, 160) }));
    }
  }
  const pass = rows.filter((r) => r.ok).length;
  console.log('---');
  console.log(JSON.stringify({ pass, total: rows.length, rows }, null, 2));
  if (pass < rows.length) process.exitCode = 1;
  else console.log('GOLD_PAIR_PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
