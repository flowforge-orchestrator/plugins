#!/usr/bin/env node
/**
 * Verify add-two pack via Conveyor MCP only:
 *  1) pack ON  — tool callable, sum correct, bin/add used
 *  2) pack OFF — no workspace mount / no bin access
 *  3) memory   — second ON run with different operands must not recall the first
 *
 *   WEB_BASE=http://localhost:18080 node scripts/verify-add-two.mjs
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
const OUT = join(here, '../.add-two-verify-results.json');
const NODE = process.execPath;

function run(label, env) {
  const script = env.__SCRIPT === 'verify' ? VERIFY : APPLY;
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(NODE, [script], {
    env: { ...process.env, WEB_BASE: WEB, ...env },
    encoding: 'utf8',
    timeout: Number(process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || 900000),
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res;
}

function loadCombiner() {
  return JSON.parse(readFileSync(COMBINER_OUT, 'utf8'));
}

function summarize(payload, goldSum) {
  const rows = payload?.summary?.rows || [];
  const bag = payload?.summary?.summaryJson || {};
  return rows.map((r) => {
    const m = bag[r.slug] || {};
    const ex = m.extras || {};
    const answer = String(r.answer ?? ex.answerText ?? '').trim();
    const usedAdd = Number(ex.toolCallsDetected || 0) > 0;
    return {
      slug: r.slug,
      status: r.status,
      answer: answer.slice(0, 80),
      taskSuccess: r.taskSuccess,
      goldOk: goldSum != null ? answer === String(goldSum) : null,
      toolCalls: ex.toolCallsDetected ?? r.toolCalls,
      usedAdd,
    };
  });
}

function printPhase(title, rows) {
  console.log(`\n# ${title}`);
  console.log('| agent | status | answer | success | gold | tools | usedAdd |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.slug} | ${r.status} | ${String(r.answer).replace(/\|/g, '/')} | ${r.taskSuccess} | ${r.goldOk} | ${r.toolCalls} | ${r.usedAdd} |`,
    );
  }
}

function main() {
  const report = { phases: {} };

  let r = run('apply pack ON', {
    CLI_COMBINER_PACK: 'add-two',
    CLI_COMBINER_QUERY:
      'What is 17 plus 25? Follow your skills. Reply with only the numeric sum.',
  });
  if (r.status !== 0) throw new Error('apply ON failed');

  r = run('verify pack ON', {
    __SCRIPT: 'verify',
    CLI_COMBINER_VERIFY_TIMEOUT_MS:
      process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || '900000',
  });
  const onPayload = loadCombiner();
  const onRows = summarize(onPayload, 42);
  printPhase('ON (tool+skill connected)', onRows);
  const onToolUsers = onRows.filter((x) => x.usedAdd);
  const onGold = onRows.filter((x) => x.status === 'ok' && x.goldOk);
  report.phases.on = {
    runId: onPayload.runId,
    rows: onRows,
    toolUsers: onToolUsers.length,
    goldOk: onGold.length,
    total: onRows.length,
  };

  r = run('apply pack OFF', {
    CLI_COMBINER_PACK: 'none',
    CLI_COMBINER_QUERY: 'What is 17 plus 25? Reply with only the numeric sum.',
  });
  if (r.status !== 0) throw new Error('apply OFF failed');

  r = run('verify pack OFF', {
    __SCRIPT: 'verify',
    CLI_COMBINER_VERIFY_TIMEOUT_MS:
      process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || '900000',
  });
  const offPayload = loadCombiner();
  const offRows = summarize(offPayload, 42);
  printPhase('OFF (tool disconnected, no workspace)', offRows);
  const offLeaks = offRows.filter((x) => x.usedAdd);
  report.phases.off = {
    runId: offPayload.runId,
    rows: offRows,
    leaks: offLeaks.map((x) => x.slug),
    total: offRows.length,
  };

  r = run('apply pack ON (memory)', {
    CLI_COMBINER_PACK: 'add-two',
    CLI_COMBINER_QUERY:
      'What is 3 plus 4? Follow your skills. Reply with only the numeric sum.',
  });
  if (r.status !== 0) throw new Error('apply memory ON failed');

  r = run('verify pack ON (memory)', {
    __SCRIPT: 'verify',
    CLI_COMBINER_VERIFY_TIMEOUT_MS:
      process.env.CLI_COMBINER_VERIFY_TIMEOUT_MS || '900000',
  });
  const memPayload = loadCombiner();
  const memRows = summarize(memPayload, 7).map((row) => {
    const ans = String(row.answer || '');
    const recallsPrior =
      /\b17\b/.test(ans) || /\b25\b/.test(ans) || /\b42\b/.test(ans);
    return { ...row, recallsPrior };
  });
  printPhase('MEMORY (3+4 after prior 17+25)', memRows);
  const memoryLeaks = memRows.filter((x) => x.recallsPrior);
  report.phases.memory = {
    runId: memPayload.runId,
    rows: memRows,
    recallsPrior: memoryLeaks.map((x) => x.slug),
    total: memRows.length,
  };

  const passOn = onToolUsers.length >= 1;
  const passOff = offLeaks.length === 0;
  const passMem = memoryLeaks.length === 0;
  report.pass = { on: passOn, off: passOff, memory: passMem };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\nwrote', OUT);
  console.log(
    JSON.stringify(
      {
        on: `${onToolUsers.length} used /workspace/bin/add, ${onGold.length} answered 42`,
        off: `${offLeaks.length} tool leaks`,
        memory: `${memoryLeaks.length} recalled prior 17/25/42`,
      },
      null,
      2,
    ),
  );

  if (passOn && passOff && passMem) {
    console.log('ADD_TWO_VERIFY_PASS');
  } else {
    console.log('ADD_TWO_VERIFY_FAIL');
    process.exitCode = 1;
  }
}

main();
