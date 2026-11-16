#!/usr/bin/env node
/**
 * Create/refresh process "CLI agents: A2A factory", publish, run once, print text + meta summary.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/apply-agent-factory.mjs
 *
 * Env:
 *   FACTORY_ORCHESTRATOR  default opencode
 *   FACTORY_ROSTER        JSON array, default ["hermes","opencode"]
 *   FACTORY_MODEL         Ollama model for OSS agents, default gemma4:31b-cloud
 *   FACTORY_TASK          task text; default asks for two delegations and one parent question
 *   FACTORY_BUDGET_MS     default 1200000
 *   FACTORY_RUN=0         apply + publish only
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const FOLDER_ID =
  process.env.FACTORY_FOLDER_ID || 'ca314815-30d9-4f9a-9890-3a3a34275acd';
const TITLE = 'CLI agents: A2A factory';
const TOOL_NAME = 'cli_agent_a2a_factory';
const PROTOCOL = '2025-03-26';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../.agent-factory-run.json');

const ORCHESTRATOR = process.env.FACTORY_ORCHESTRATOR || 'opencode';
const ROSTER = process.env.FACTORY_ROSTER || '["hermes","opencode"]';
const MODEL = process.env.FACTORY_MODEL || 'gemma4:31b-cloud';
const BUDGET_MS = Number(process.env.FACTORY_BUDGET_MS || 1_200_000);
const TASK =
  process.env.FACTORY_TASK ||
  [
    'Собери ответ из двух частей, делегируя каждую часть отдельному агенту.',
    '1. Запусти агента opencode с задачей: «Посчитай 17 * 23. Перед ответом спроси родителя через a2a_ask_parent, в каком формате вернуть число, и верни его в этом формате».',
    '   Когда он спросит, ответь через a2a_reply: «римскими цифрами».',
    '2. Запусти агента hermes с задачей: «Назови столицу Австралии одним словом».',
    'Итог: одна строка вида «<число> | <город>» из результатов агентов.',
  ].join('\n');

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

function mcpHeaders(token, sid) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': PROTOCOL,
    ...(sid ? { 'mcp-session-id': sid } : {}),
  };
}

async function openMcp(token) {
  const res = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(token),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'apply-agent-factory', version: '0' },
      },
    }),
  });
  const sid = res.headers.get('mcp-session-id');
  if (!sid) throw new Error('no mcp-session-id');
  await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(token, sid),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return sid;
}

let callId = 1;
async function mcpCall(token, sid, name, args) {
  callId += 1;
  const res = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(token, sid),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: callId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}: ${text.slice(0, 400)}`);
  const body = parseMcpBody(text);
  if (body.error) throw new Error(`MCP ${name}: ${JSON.stringify(body.error)}`);
  const content = body.result?.content?.[0]?.text;
  if (body.result?.isError) throw new Error(`MCP ${name}: ${content}`);
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return body.result;
}

function graph() {
  const nodes = [
    {
      id: 'trigger',
      nodeType: 'system.trigger.input',
      label: 'input',
      outputs: ['query'],
      config: [{ name: 'query', defaultValue: '' }],
    },
    {
      id: 'llm_config',
      nodeType: 'plugin.cli-agent.llm-config',
      label: 'llm config',
      outputs: ['llmConfig'],
      config: [
        { name: 'provider', type: 'string', isPort: false, defaultValue: 'ollama' },
        { name: 'model', type: 'string', isPort: false, defaultValue: MODEL },
        {
          name: 'baseUrl',
          type: 'string',
          isPort: false,
          defaultValue: 'http://host.docker.internal:11434/v1',
        },
        {
          name: 'apiKey',
          type: 'ref',
          secretKind: 'CLI_AGENT_API_KEY',
          isPort: false,
          isRequired: false,
          defaultValue: 'CLI_AGENT_API_KEY',
        },
      ],
    },
    {
      id: 'factory',
      nodeType: 'plugin.cli-agent.factory',
      label: 'agent factory',
      outputs: ['text', 'status', 'meta'],
      config: [
        { name: 'task', isPort: true, defaultValue: '' },
        { name: 'llmConfig', isPort: true, defaultValue: '' },
        { name: 'orchestrator', defaultValue: ORCHESTRATOR },
        { name: 'roster', defaultValue: ROSTER },
        { name: 'maxAgents', defaultValue: 5 },
        { name: 'maxDepth', defaultValue: 1 },
        { name: 'agentTimeoutMs', defaultValue: 600000 },
        { name: 'budgetMs', isPort: false, defaultValue: BUDGET_MS },
      ],
    },
    {
      id: 'output',
      nodeType: 'system.output',
      config: [
        { name: 'text', isPort: true, defaultValue: '' },
        { name: 'status', isPort: true, defaultValue: '' },
        { name: 'meta', isPort: true, defaultValue: '' },
      ],
    },
  ];
  const edges = [
    { source: 'trigger', target: 'factory', sourceHandle: 'query', targetHandle: 'task' },
    { source: 'llm_config', target: 'factory', sourceHandle: 'llmConfig', targetHandle: 'llmConfig' },
    ...['text', 'status', 'meta'].map((h) => ({
      source: 'factory',
      target: 'output',
      sourceHandle: h,
      targetHandle: h,
    })),
  ];
  return {
    nodes,
    edges,
    settings: {
      name: TITLE,
      description:
        'One plugin.cli-agent.factory node: orchestrator CLI agent spawns a team over A2A tools. Input port: query.',
      isActive: true,
      triggers: [
        { type: 'manual' },
        { type: 'webhook' },
        {
          type: 'mcp_tool',
          toolName: TOOL_NAME,
          description: 'Run an A2A team of CLI agents on input query; returns text, status, meta.',
        },
      ],
    },
  };
}

async function ensureDiagram(token) {
  const list = await (
    await fetch(`${WEB}/diagram`, { headers: { authorization: `Bearer ${token}` } })
  ).json();
  const diagrams = Array.isArray(list) ? list : list.items || [];
  const found = diagrams.find((d) => (d.title || d.name || d.settings?.name) === TITLE);
  if (found) {
    console.log('reuse', found.id);
    return found.id;
  }
  const created = await fetch(`${WEB}/diagram`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: TITLE, folderId: FOLDER_ID }),
  });
  const text = await created.text();
  if (!created.ok) throw new Error(`create: ${created.status} ${text}`);
  const id = JSON.parse(text).id;
  console.log('created', id);
  return id;
}

function summarize(result) {
  const out = result?.result ?? result ?? {};
  let meta = out.meta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      // leave raw
    }
  }
  console.log('\nstatus:', out.status);
  console.log('text:', String(out.text ?? '').slice(-1500));
  if (meta && typeof meta === 'object') {
    console.log('\ntotals:', JSON.stringify(meta.totals));
    for (const a of meta.agents ?? []) {
      console.log(
        `  ${a.id} ${a.slug} parent=${a.parentId ?? '-'} depth=${a.depth} ${a.state} ${a.latencyMs ?? '?'}ms ${a.error ? `error=${a.error}` : ''}`,
      );
    }
    console.log('calls:');
    for (const c of meta.calls ?? []) {
      console.log(`  #${c.seq} +${c.atMs}ms ${c.kind} ${c.from} → ${c.to}: ${c.preview.slice(0, 140)}`);
    }
  }
  return { out, meta };
}

async function main() {
  const token = await sessionToken();
  const sid = await openMcp(token);
  const diagramId = await ensureDiagram(token);
  await mcpCall(token, sid, 'process_apply', { diagramId, ...graph() });
  const validation = await mcpCall(token, sid, 'process_validate', { diagramId });
  console.log('validate', JSON.stringify(validation).slice(0, 300));
  await mcpCall(token, sid, 'process_publish', { diagramId });
  console.log('published', diagramId);
  if (process.env.FACTORY_RUN === '0') return;

  const started = await mcpCall(token, sid, 'process_start', {
    diagramId,
    payload: { query: TASK },
  });
  const runId = started.runId || started.id;
  if (!runId) throw new Error(`process_start failed: ${JSON.stringify(started)}`);
  console.log('runId', runId);

  const deadline = Date.now() + BUDGET_MS + 120_000;
  let waited = { status: 'running' };
  while (Date.now() < deadline) {
    waited = await mcpCall(token, sid, 'run_wait', {
      diagramId,
      runId,
      timeoutMs: 60_000,
      pollIntervalMs: 2000,
    });
    console.log('run status', waited.status);
    if (['finished', 'failed', 'canceled', 'awaiting_user'].includes(waited.status)) break;
  }
  let result = waited;
  if (waited.status === 'finished' && !waited.result) {
    result = await mcpCall(token, sid, 'run_result', { diagramId, runId });
  }
  if (waited.status !== 'finished') {
    result = await mcpCall(token, sid, 'run_status', { diagramId, runId });
    console.log(JSON.stringify(result).slice(0, 3000));
  }
  const { out, meta } = summarize(result);
  writeFileSync(OUT, JSON.stringify({ diagramId, runId, task: TASK, status: out.status, text: out.text, meta }, null, 2));
  console.log('\nwrote', OUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
