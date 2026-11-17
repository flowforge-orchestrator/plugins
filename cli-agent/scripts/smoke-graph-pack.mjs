#!/usr/bin/env node
/**
 * Smoke all Graph pack agents with one chuk_i_gek fact question.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/smoke-graph-pack.mjs
 *   ONLY=hermes,opencode node scripts/smoke-graph-pack.mjs
 */
const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const ONLY = new Set(
  (process.env.ONLY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const AGENTS = {
  hermes: {
    id: '72e7a508-4475-4024-a301-e99d9ced6899',
    provider: 'ollama',
    model: 'gemma4:12b-mlx',
    baseUrl: 'http://host.docker.internal:11434/v1',
  },
  'claude-code': {
    id: 'c7af1365-e3e0-4fdc-9e3e-3c1799a1fcf9',
    provider: 'anthropic',
    model: process.env.SMOKE_MODEL_CLAUDE_CODE || '',
    baseUrl: '',
  },
  opencode: {
    id: '3adae966-0fef-492e-82f1-396a2368e867',
    provider: 'ollama',
    model: 'gemma4:12b-mlx',
    baseUrl: 'http://host.docker.internal:11434/v1',
  },
  cursor: {
    id: '1cf99653-facb-40ac-8cc6-1c98caf64bdb',
    provider: 'openai',
    model: process.env.SMOKE_MODEL_CURSOR || 'auto',
    baseUrl: '',
  },
  aider: {
    id: '61e9a64e-f9c9-4de1-ac35-39256678c9a6',
    provider: 'custom',
    model: 'openai/gemma4:12b-mlx',
    baseUrl: 'http://host.docker.internal:11434/v1',
  },
  codex: {
    id: 'bdd167c1-2fc1-4507-987a-2d6cd63ad845',
    provider: 'openai',
    model: process.env.SMOKE_MODEL_CODEX || '',
    baseUrl: '',
  },
  zai: {
    id: 'c065c845-1448-4b36-bb53-ad48759d74c2',
    provider: 'zai',
    model: process.env.SMOKE_MODEL_ZAI || '',
    baseUrl: '',
  },
};

const TASK =
  process.env.SMOKE_TASK ||
  'По рассказу «Чук и Гек»: в каком городе жили Чук и Гек с родителями? Ответь одним словом.';

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

async function runOne(tok, slug, agent) {
  const start = await fetch(`${WEB}/flow/${agent.id}/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tok}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      task: TASK,
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
    return { slug, ok: false, error: `start: ${JSON.stringify(started).slice(0, 300)}` };
  }
  let status = 'unknown';
  for (let i = 0; i < 180; i += 1) {
    const st = await fetch(`${WEB}/flow/${agent.id}/runs/${runId}`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    const body = await st.json();
    status = body?.run?.status || body?.status || 'unknown';
    if (['finished', 'failed', 'canceled', 'error'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const result = await fetch(
    `${WEB}/flow/${agent.id}/runs/${runId}/result`,
    { headers: { authorization: `Bearer ${tok}` } },
  );
  const data = await result.json();
  const pi = data.publicInputs || data;
  const text = String(pi.text || pi.stdout || '');
  const hit = /москв/i.test(text);
  return {
    slug,
    ok: status === 'finished' && hit,
    status,
    runId,
    hit,
    text: text.slice(-800),
    stderr: String(pi.stderr || '').slice(0, 400),
  };
}

async function main() {
  const tok = await token();
  const rows = [];
  for (const [slug, agent] of Object.entries(AGENTS)) {
    if (ONLY.size && !ONLY.has(slug)) continue;
    if (!agent.model) {
      console.log('skip', slug, '(no model)');
      continue;
    }
    console.log('start', slug);
    const row = await runOne(tok, slug, agent);
    rows.push(row);
    console.log(
      JSON.stringify({
        slug: row.slug,
        ok: row.ok,
        status: row.status,
        hit: row.hit,
        text: row.text.slice(0, 200),
        stderr: row.stderr.slice(0, 120),
      }),
    );
  }
  console.log('---');
  console.log(
    JSON.stringify(
      rows.map((r) => ({ slug: r.slug, ok: r.ok, status: r.status, hit: r.hit })),
      null,
      2,
    ),
  );
  if (rows.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
