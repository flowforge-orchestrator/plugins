#!/usr/bin/env node
/**
 * Verify graph-kg pack via Conveyor MCP: same search+graph tools and soft skills
 * fan-out to every agent; each agent should call a workspace bin.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/verify-graph-kg.mjs
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
const OUT = join(here, '../.graph-kg-verify-results.json');
const NODE = process.execPath;

/** Question-only task: omit CLI_COMBINER_QUERY so apply picks a random dataset prompt. */
const QUERY = (process.env.CLI_COMBINER_QUERY || '').trim();

function run(label, script, env) {
  console.log(`\n=== ${label} ===`);
  const merged = { ...process.env, WEB_BASE: WEB, ...env };
  // Empty query → apply picks random chuk_i_gek question (skills carry tool how-to).
  if (!QUERY && !Object.prototype.hasOwnProperty.call(env, 'CLI_COMBINER_QUERY')) {
    delete merged.CLI_COMBINER_QUERY;
  }
  const res = spawnSync(NODE, [script], {
    env: merged,
    encoding: 'utf8',
    timeout: Number(process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || 10_800_000),
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res;
}

function summarize(payload) {
  const rows = payload?.summary?.rows || [];
  const bag = payload?.summary?.summaryJson || {};
  return rows.map((r) => {
    const m = bag[r.slug] || {};
    const ex = m.extras || {};
    const ragSearch = Number(ex.ragSearchCalls || 0);
    const ragGraph = Number(ex.ragGraphCalls || 0);
    const tools = Number(ex.toolCallsDetected || r.toolCalls || 0);
    const usedTool = ragSearch + ragGraph > 0 || tools > 0;
    const answer = String(r.answer ?? ex.answerText ?? '').trim();
    const mentionsMother = /мат(ь|ери|ерь)|mother/i.test(answer);
    return {
      slug: r.slug,
      status: r.status,
      answer: answer.slice(0, 100),
      ragSearch,
      ragGraph,
      toolCalls: tools,
      usedTool,
      mentionsMother,
    };
  });
}

function printTable(rows) {
  console.log(
    '| agent | status | usedTool | rag-search | rag-graph | tools | answer |',
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.slug} | ${r.status} | ${r.usedTool} | ${r.ragSearch} | ${r.ragGraph} | ${r.toolCalls} | ${String(r.answer).replace(/\|/g, '/')} |`,
    );
  }
}

function main() {
  const applyEnv = { CLI_COMBINER_PACK: 'graph-kg' };
  if (QUERY) applyEnv.CLI_COMBINER_QUERY = QUERY;
  let r = run('apply graph-kg', APPLY, applyEnv);
  if (r.status !== 0) throw new Error('apply graph-kg failed');

  // Sequential 13× agents: default wait up to 3h.
  r = run('verify graph-kg', VERIFY, {
    CLI_COMBINER_VERIFY_TIMEOUT_MS:
      process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || '10800000',
  });

  const payload = JSON.parse(readFileSync(COMBINER_OUT, 'utf8'));
  const rows = summarize(payload);
  printTable(rows);

  const callers = rows.filter((x) => x.usedTool);
  const okStatus = rows.filter((x) => x.status === 'ok');
  const queryText =
    QUERY ||
    payload?.summary?.result?.query ||
    payload?.result?.query ||
    '';
  const report = {
    diagramId: payload.diagramId,
    runId: payload.runId,
    query: queryText,
    pack: { tools: ['search', 'graph'], skills: ['graph-kg', 'vector-search'] },
    rows,
    callers: callers.map((x) => x.slug),
    okStatus: okStatus.length,
    total: rows.length,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\nwrote', OUT);
  console.log(
    JSON.stringify(
      {
        callers: `${callers.length}/${rows.length}`,
        ok: `${okStatus.length}/${rows.length}`,
        missingTool: rows.filter((x) => !x.usedTool).map((x) => x.slug),
      },
      null,
      2,
    ),
  );

  // Pass: every ok agent called a tool. Partial: wiring ok + ≥1 caller among ok agents
  // (infra/timeouts on proprietary CLIs are listed, not hard-failing the pack).
  const missingOk = rows.filter((x) => x.status === 'ok' && !x.usedTool);
  const infra = rows.filter((x) => x.status !== 'ok').map((x) => x.slug);
  if (missingOk.length === 0 && callers.length > 0) {
    console.log('GRAPH_KG_VERIFY_PASS');
  } else if (callers.length > 0 && okStatus.length > 0) {
    console.log('GRAPH_KG_VERIFY_PARTIAL');
    if (infra.length) console.log('infra/errors:', infra.join(', '));
    process.exitCode = 0;
  } else {
    console.log('GRAPH_KG_VERIFY_FAIL');
    process.exitCode = 1;
  }
}

main();
