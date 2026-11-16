#!/usr/bin/env node
/**
 * Strengthen-and-probe: graph-kg pack on the agents that failed hardest last run.
 * Question-only task (random dataset); tools/how-to stay in skills + AGENTS.md.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/probe-weak-agents.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));
const APPLY = join(here, 'apply-cli-combiner.mjs');
const VERIFY = join(here, 'verify-cli-combiner.mjs');
const COMBINER_OUT = join(here, '../.combiner-verify-results.json');
const OUT = join(here, '../.weak-agents-probe.json');
const NODE = process.execPath;

const WEAK =
  process.env.CLI_COMBINER_AGENTS ||
  'crush,goose,aider,kilo,openclaw,pi,codex,claude-code';

function run(label, script, env) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(NODE, [script], {
    env: { ...process.env, WEB_BASE: WEB, ...env },
    encoding: 'utf8',
    timeout: Number(process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || 7_200_000),
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res;
}

function main() {
  const applyEnv = {
    CLI_COMBINER_PACK: 'graph-kg',
    CLI_COMBINER_AGENTS: WEAK,
  };
  // Question-only: do not set CLI_COMBINER_QUERY → apply picks dataset prompt.
  if ((process.env.CLI_COMBINER_QUERY || '').trim()) {
    applyEnv.CLI_COMBINER_QUERY = process.env.CLI_COMBINER_QUERY.trim();
  }

  let r = run('apply weak subset', APPLY, applyEnv);
  if (r.status !== 0) throw new Error('apply failed');

  r = run('verify weak subset', VERIFY, {
    CLI_COMBINER_VERIFY_TIMEOUT_MS:
      process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || '7200000',
  });

  const payload = JSON.parse(readFileSync(COMBINER_OUT, 'utf8'));
  const rows = payload?.summary?.rows || [];
  const bag = payload?.summary?.summaryJson || {};
  const query =
    payload?.result?.query ||
    payload?.summary?.result?.query ||
    payload?.result?.result?.query ||
    '';

  const table = rows.map((row) => {
    const m = bag[row.slug] || {};
    const ex = m.extras || {};
    return {
      slug: row.slug,
      status: row.status,
      latencyMs: row.latencyMs,
      toolCalls: ex.toolCallsDetected ?? row.toolCalls ?? 0,
      ragSearch: ex.ragSearchCalls ?? 0,
      ragGraph: ex.ragGraphCalls ?? 0,
      answer: String(row.answer ?? ex.answerText ?? '').slice(0, 160),
    };
  });

  console.log('\n| agent | status | t_ms | tools | answer |');
  console.log('|---|---|---|---|---|');
  for (const t of table) {
    console.log(
      `| ${t.slug} | ${t.status} | ${t.latencyMs} | ${t.toolCalls} | ${t.answer.replace(/\|/g, '/')} |`,
    );
  }

  const report = {
    query,
    agents: WEAK.split(','),
    runId: payload.runId,
    diagramId: payload.diagramId,
    table,
    callers: table.filter((t) => t.toolCalls > 0).map((t) => t.slug),
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\nwrote', OUT);
  console.log(
    JSON.stringify(
      {
        callers: `${report.callers.length}/${table.length}`,
        ok: `${table.filter((t) => t.status === 'ok').length}/${table.length}`,
      },
      null,
      2,
    ),
  );
}

main();
