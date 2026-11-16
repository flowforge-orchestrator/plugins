#!/usr/bin/env node
/**
 * Isolated poll of a published CLI-agent cell.
 * Each question is its own process start: no prior answer is sent along.
 *
 *   node scripts/smoke/chuk-gek/poll-cell.mjs
 *   node scripts/smoke/chuk-gek/poll-cell.mjs --agent hermes --question 1
 *   node scripts/smoke/chuk-gek/poll-cell.mjs --lane opensource
 *   node scripts/smoke/chuk-gek/poll-cell.mjs --all
 *
 * Open-source agents use matrix.json (ollama / gemma4:12b-mlx; Aider uses
 * provider=custom and model openai/gemma4:12b-mlx).
 * Proprietary agents read their model from:
 *   SMOKE_MODEL_CLAUDE_CODE, SMOKE_MODEL_CODEX, SMOKE_MODEL_CURSOR, SMOKE_MODEL_ZAI
 * Optional base URL override: <VAR>_BASE_URL
 *
 * CONVEYOR_API_BASE (default http://localhost:8080) and CONVEYOR_API_TOKEN
 * are required for a live poll. Results land in .smoke-chuk-gek/results.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMcpClient } from './mcp-cell.mjs';
import { buildQuestionPrompt } from './prompt.mjs';
import { planMatrix, resolveAgentRun } from './resolve-agent.mjs';
import { answerText, scoreAnswer } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(readFileSync(join(here, 'matrix.json'), 'utf8'));
const bank = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'));
const resultsPath = join(here, '../../../.smoke-chuk-gek/results.json');
const CELL_TIMEOUT_MS = 600_000;
const WAIT_SLICE_MS = 110_000;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printUsage() {
  console.log(`Usage:
  node scripts/smoke/chuk-gek/poll-cell.mjs [--list]
  node scripts/smoke/chuk-gek/poll-cell.mjs --agent <slug> [--question <n|qNN>]
  node scripts/smoke/chuk-gek/poll-cell.mjs --lane <opensource|proprietary> [--question <n|qNN>]
  node scripts/smoke/chuk-gek/poll-cell.mjs --all`);
}

function questionId(raw) {
  if (!raw) {
    return undefined;
  }
  if (/^q\d+$/i.test(raw)) {
    return `q${raw.slice(1).padStart(2, '0')}`;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > bank.questions.length) {
    throw new Error(`question must be 1..${bank.questions.length}`);
  }
  return `q${String(n).padStart(2, '0')}`;
}

function selectAgents(live) {
  const slug = argValue('--agent');
  const lane = argValue('--lane');
  const all = hasFlag('--all');
  let agents = matrix.agents.filter((agent) => !agent.skip);
  if (slug) {
    agents = matrix.agents.filter((agent) => agent.slug === slug);
    if (agents.length === 0) {
      throw new Error(`unknown agent ${slug}`);
    }
  }
  if (lane) {
    agents = agents.filter((agent) => agent.lane === lane);
    if (agents.length === 0) {
      throw new Error(`unknown lane ${lane}`);
    }
  }
  if (!slug && !lane && !all && !hasFlag('--list')) {
    return [];
  }
  if (live) {
    return agents.map((agent) => resolveAgentRun(agent, matrix.opensource));
  }
  return planMatrix(matrix);
}

function selectQuestions() {
  const id = questionId(argValue('--question'));
  if (!id) {
    return bank.questions;
  }
  const found = bank.questions.filter((question) => question.id === id);
  if (found.length === 0) {
    throw new Error(`unknown question ${id}`);
  }
  return found;
}

function printPlan(rows) {
  for (const row of rows) {
    const model = row.model ?? `(set ${row.modelEnv})`;
    console.log(
      `${row.slug}\t${row.lane}\t${row.provider}\t${model}\t${row.toolName}`,
    );
  }
  console.log(`questions\t${bank.questions.length}\tcollection\t${bank.collectionId}`);
}

function loadResults() {
  try {
    return JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch {
    return { collectionId: bank.collectionId, cells: [] };
  }
}

function saveCell(cell) {
  const doc = loadResults();
  const key = `${cell.agent}:${cell.questionId}`;
  doc.collectionId = bank.collectionId;
  doc.updatedAt = new Date().toISOString();
  doc.cells = [
    ...doc.cells.filter((row) => `${row.agent}:${row.questionId}` !== key),
    cell,
  ];
  mkdirSync(dirname(resultsPath), { recursive: true });
  writeFileSync(resultsPath, JSON.stringify(doc, null, 2));
}

function findProcess(processes, agent) {
  return processes.find((process) => {
    const triggers = process.triggers ?? [];
    return (
      triggers.some((trigger) => trigger.toolName === agent.toolName) ||
      process.title === agent.title
    );
  });
}

async function waitForCell(client, diagramId, runId) {
  const deadline = Date.now() + CELL_TIMEOUT_MS;
  let last = { runId, status: 'timeout' };
  while (Date.now() < deadline) {
    last = await client.call('run_wait', {
      diagramId,
      runId,
      timeoutMs: WAIT_SLICE_MS,
      pollIntervalMs: 2000,
    });
    if (
      last.status === 'finished' ||
      last.status === 'failed' ||
      last.status === 'canceled' ||
      last.status === 'awaiting_user'
    ) {
      return last;
    }
  }
  return last;
}

async function pollOne(client, processes, agent, question) {
  const process = findProcess(processes, agent);
  if (!process) {
    throw new Error(`published cell not found for ${agent.toolName}`);
  }
  const task = buildQuestionPrompt(question, bank.collectionId);
  const startedAt = Date.now();
  const started = await client.call(agent.toolName, {
    task,
    provider: agent.provider,
    model: agent.model,
    baseUrl: agent.baseUrl,
    tools: '',
    skills: '',
    workspace: matrix.workspace || '',
    timeoutMs: CELL_TIMEOUT_MS,
  });
  const runId = started.runId;
  if (!runId) {
    throw new Error(`cell ${agent.slug} did not return runId`);
  }
  const waited = await waitForCell(client, process.id, runId);
  const text = answerText(waited.result);
  // Score the answer tail: long agent transcripts often restate every option.
  const scored = scoreAnswer(text.slice(-1200), question);
  const cell = {
    agent: agent.slug,
    lane: agent.lane,
    provider: agent.provider,
    model: agent.model,
    questionId: question.id,
    gold: scored.gold,
    picked: scored.picked,
    match: scored.match,
    status: waited.status,
    text,
    runId,
    diagramId: process.id,
    ms: Date.now() - startedAt,
  };
  saveCell(cell);
  console.log(JSON.stringify(cell));
  return cell;
}

async function main() {
  if (hasFlag('--help')) {
    printUsage();
    return;
  }
  const live =
    hasFlag('--all') ||
    argValue('--agent') !== undefined ||
    argValue('--lane') !== undefined;
  if (!live || hasFlag('--list')) {
    const slug = argValue('--agent');
    const lane = argValue('--lane');
    const rows = planMatrix(matrix).filter((row) => {
      if (slug && row.slug !== slug) {
        return false;
      }
      if (lane && row.lane !== lane) {
        return false;
      }
      return true;
    });
    printPlan(rows);
    if (!live && !hasFlag('--list')) {
      printUsage();
    }
    return;
  }
  const agents = selectAgents(true);
  const questions = selectQuestions();
  const base = process.env.CONVEYOR_API_BASE ?? 'http://localhost:8080';
  const token = process.env.CONVEYOR_API_TOKEN ?? '';
  if (!token) {
    throw new Error('Set CONVEYOR_API_TOKEN');
  }
  const client = createMcpClient({ baseUrl: base, token });
  await client.connect();
  const listed = await client.call('process_list', {});
  const processes = listed.processes ?? [];
  let failed = 0;
  for (const agent of agents) {
    for (const question of questions) {
      const cell = await pollOne(client, processes, agent, question);
      if (!cell.match) {
        failed += 1;
      }
    }
  }
  console.log(`SUMMARY ${questions.length * agents.length - failed}/${questions.length * agents.length}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
