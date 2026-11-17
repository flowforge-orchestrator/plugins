#!/usr/bin/env node
/**
 * Outer process: sequential system.loop over the chuk-gek golden dataset.
 * Each iteration process.call → CLI agents tools+skills combiner with { query }.
 *
 * Port contract (matches working process.call widgets):
 *   call inputs  = combiner trigger outputs except `trigger` → `query` (isPort:true)
 *   call outputs = combiner system.output fields (status_/answer_/metrics_/query)
 *
 *   WEB_BASE=http://localhost:18080 node scripts/apply-cli-dataset-loop.mjs
 *   CLI_DATASET_LIMIT=2 node scripts/apply-cli-dataset-loop.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const FOLDER_ID =
  process.env.COMBINER_FOLDER_ID || 'ca314815-30d9-4f9a-9890-3a3a34275acd';
const COMBINER_TITLE = 'CLI agents: tools+skills combiner';
const TITLE = 'CLI agents: golden dataset loop';
const TOOL_NAME = 'cli_agent_golden_dataset_loop';
const PROTOCOL = '2025-03-26';
const here = dirname(fileURLToPath(import.meta.url));

const LIMIT = Number(process.env.CLI_DATASET_LIMIT || 0);

function loadQuestions() {
  const path = join(here, 'smoke/chuk-gek/questions.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  let list = (data.questions || []).map((q) => ({
    id: q.id,
    prompt: String(q.prompt || '').trim(),
    gold: q.gold ?? null,
  }));
  if (LIMIT > 0) list = list.slice(0, LIMIT);
  if (list.length === 0) throw new Error(`no questions in ${path}`);
  return list;
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
        clientInfo: { name: 'apply-cli-dataset-loop', version: '0' },
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

async function mcpCall(token, sessionId, name, args, id = 1) {
  const res = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
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

async function findDiagram(token, title) {
  const listRes = await fetch(`${WEB}/diagram`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  const diagrams = Array.isArray(listData) ? listData : listData.items || [];
  return diagrams.find((d) => (d.title || d.name || d.settings?.name) === title);
}

/** Combiner trigger outputs (inputs of process.call), excluding `trigger`. */
function combinerCallInputs(combinerDiagram) {
  const trig = (combinerDiagram.widgets || []).find(
    (w) => !w.parentId && w.source?.nodeType === 'system.trigger.input',
  );
  return (trig?.outputs || []).filter(
    (n) => typeof n === 'string' && n && n !== 'trigger',
  );
}

/** Combiner system.output fields (outputs of process.call). */
function combinerCallOutputs(combinerDiagram) {
  const output = (combinerDiagram.widgets || []).find(
    (w) => !w.parentId && w.source?.nodeType === 'system.output',
  );
  return (output?.config || [])
    .map((f) => f.name)
    .filter((n) => typeof n === 'string' && n);
}

const PROMPT_SRC = `
function (input) {
  if (input && typeof input === 'object' && input.prompt != null) {
    return String(input.prompt);
  }
  return String(input == null ? '' : input);
}
`.trim();

const GOLD_SRC = `
function (input) {
  if (input && typeof input === 'object' && input.gold != null) {
    return String(input.gold);
  }
  return '';
}
`.trim();

const ID_SRC = `
function (input) {
  if (input && typeof input === 'object' && input.id != null) {
    return String(input.id);
  }
  return '';
}
`.trim();

function port(name, extra = {}) {
  return {
    name,
    isPort: true,
    canBePort: true,
    type: 'string',
    defaultValue: '',
    ...extra,
  };
}

function buildGraph(combinerId, callInputs, callOutputs, questions) {
  // process.call: static diagramId/diagramName + dynamic input ports from combiner trigger.
  const callConfig = [
    {
      name: 'diagramId',
      defaultValue: combinerId,
      isPort: false,
      canBePort: false,
      type: 'string',
      isPrimary: true,
      isRequired: true,
    },
    {
      name: 'diagramName',
      defaultValue: COMBINER_TITLE,
      isPort: false,
      canBePort: false,
      type: 'string',
    },
    ...callInputs.map((name) =>
      port(name, {
        isRequired: name === 'query',
        isPrimary: name === 'query',
      }),
    ),
  ];

  // Iteration result: dataset fields + per-agent status/answer (skip bulky metrics_/model/tools/skills).
  const forwardFromCall = callOutputs.filter(
    (n) =>
      n === 'query' ||
      n.startsWith('status_') ||
      n.startsWith('answer_'),
  );
  const bodyOutConfig = [
    port('questionId'),
    port('query'),
    port('gold'),
    port('index', { type: 'number', defaultValue: 0 }),
    ...forwardFromCall
      .filter((n) => !['query'].includes(n))
      .map((n) => port(n)),
  ];

  const nodes = [
    {
      id: 'trigger',
      nodeType: 'system.trigger.input',
      outputs: ['trigger'],
      config: [{ name: 'trigger', defaultValue: '' }],
    },
    {
      id: 'questions',
      nodeType: 'system.control.constant',
      label: 'golden questions',
      config: [
        {
          name: 'value',
          defaultValue: questions,
          isPort: false,
          canBePort: false,
        },
      ],
    },
    {
      id: 'loop',
      nodeType: 'system.loop',
      label: 'dataset sequential',
      config: [
        {
          name: 'iterator',
          isPort: true,
          canBePort: true,
          defaultValue: [],
        },
        { name: 'mode', defaultValue: 'sequential', isPort: false },
        {
          name: 'body',
          defaultValue: { widgets: [], edges: [] },
          isPort: false,
        },
      ],
    },
    // --- loop body ---
    {
      id: 'b_trigger',
      nodeType: 'system.trigger.input',
      parentId: 'loop',
      outputs: ['item', 'index', 'total', 'trigger'],
      config: [
        port('item', { isRequired: true, isPrimary: true, type: 'keyvalue' }),
        port('index', { type: 'number', defaultValue: 0 }),
        port('total', { type: 'number', defaultValue: 0 }),
        { name: 'trigger', defaultValue: '' },
      ],
    },
    {
      id: 'b_src_prompt',
      nodeType: 'system.control.constant',
      parentId: 'loop',
      label: 'src item.prompt',
      config: [
        {
          name: 'value',
          defaultValue: PROMPT_SRC,
          isPort: false,
          canBePort: false,
        },
      ],
    },
    {
      id: 'b_src_gold',
      nodeType: 'system.control.constant',
      parentId: 'loop',
      label: 'src item.gold',
      config: [
        {
          name: 'value',
          defaultValue: GOLD_SRC,
          isPort: false,
          canBePort: false,
        },
      ],
    },
    {
      id: 'b_src_qid',
      nodeType: 'system.control.constant',
      parentId: 'loop',
      label: 'src item.id',
      config: [
        {
          name: 'value',
          defaultValue: ID_SRC,
          isPort: false,
          canBePort: false,
        },
      ],
    },
    {
      id: 'b_prompt',
      nodeType: 'plugin.execution.code',
      parentId: 'loop',
      label: 'item.prompt',
      config: [
        { name: 'language', isPort: false, defaultValue: 'javascript' },
        { name: 'source', isPort: true, canBePort: true, defaultValue: '' },
        { name: 'input', isPort: true, canBePort: true, defaultValue: '' },
        { name: 'timeoutMs', isPort: false, defaultValue: 2000 },
      ],
    },
    {
      id: 'b_gold',
      nodeType: 'plugin.execution.code',
      parentId: 'loop',
      label: 'item.gold',
      config: [
        { name: 'language', isPort: false, defaultValue: 'javascript' },
        { name: 'source', isPort: true, canBePort: true, defaultValue: '' },
        { name: 'input', isPort: true, canBePort: true, defaultValue: '' },
        { name: 'timeoutMs', isPort: false, defaultValue: 2000 },
      ],
    },
    {
      id: 'b_qid',
      nodeType: 'plugin.execution.code',
      parentId: 'loop',
      label: 'item.id',
      config: [
        { name: 'language', isPort: false, defaultValue: 'javascript' },
        { name: 'source', isPort: true, canBePort: true, defaultValue: '' },
        { name: 'input', isPort: true, canBePort: true, defaultValue: '' },
        { name: 'timeoutMs', isPort: false, defaultValue: 2000 },
      ],
    },
    {
      id: 'b_call',
      nodeType: 'system.process.call',
      parentId: 'loop',
      label: 'combiner',
      outputs: callOutputs,
      config: callConfig,
    },
    {
      id: 'b_out',
      nodeType: 'system.output',
      parentId: 'loop',
      config: bodyOutConfig,
    },
    {
      id: 'qcount',
      nodeType: 'system.array.length',
      label: 'question count',
      config: [
        {
          name: 'items',
          isPort: true,
          canBePort: true,
          defaultValue: [],
        },
      ],
    },
    {
      id: 'output',
      nodeType: 'system.output',
      config: [
        port('items', { type: 'keyvalue', defaultValue: [] }),
        port('questionCount', { type: 'number', defaultValue: 0 }),
      ],
    },
  ];

  const edges = [
    {
      source: 'questions',
      target: 'loop',
      sourceHandle: 'value',
      targetHandle: 'iterator',
    },
    {
      source: 'questions',
      target: 'qcount',
      sourceHandle: 'value',
      targetHandle: 'items',
    },
    {
      source: 'loop',
      target: 'output',
      sourceHandle: 'items',
      targetHandle: 'items',
    },
    {
      source: 'qcount',
      target: 'output',
      sourceHandle: 'number',
      targetHandle: 'questionCount',
    },
    // body: sources → code
    {
      source: 'b_src_prompt',
      target: 'b_prompt',
      sourceHandle: 'value',
      targetHandle: 'source',
    },
    {
      source: 'b_src_gold',
      target: 'b_gold',
      sourceHandle: 'value',
      targetHandle: 'source',
    },
    {
      source: 'b_src_qid',
      target: 'b_qid',
      sourceHandle: 'value',
      targetHandle: 'source',
    },
    {
      source: 'b_trigger',
      target: 'b_prompt',
      sourceHandle: 'item',
      targetHandle: 'input',
    },
    {
      source: 'b_trigger',
      target: 'b_gold',
      sourceHandle: 'item',
      targetHandle: 'input',
    },
    {
      source: 'b_trigger',
      target: 'b_qid',
      sourceHandle: 'item',
      targetHandle: 'input',
    },
    // prompt → process.call.query (combiner input)
    {
      source: 'b_prompt',
      target: 'b_call',
      sourceHandle: 'value',
      targetHandle: 'query',
    },
    // dataset meta → b_out (not from call.query — avoids double-wire)
    {
      source: 'b_qid',
      target: 'b_out',
      sourceHandle: 'value',
      targetHandle: 'questionId',
    },
    {
      source: 'b_prompt',
      target: 'b_out',
      sourceHandle: 'value',
      targetHandle: 'query',
    },
    {
      source: 'b_gold',
      target: 'b_out',
      sourceHandle: 'value',
      targetHandle: 'gold',
    },
    {
      source: 'b_trigger',
      target: 'b_out',
      sourceHandle: 'index',
      targetHandle: 'index',
    },
  ];

  for (const name of forwardFromCall) {
    if (name === 'query') continue; // already from b_prompt
    edges.push({
      source: 'b_call',
      target: 'b_out',
      sourceHandle: name,
      targetHandle: name,
    });
  }

  return {
    settings: {
      name: TITLE,
      description:
        'Sequential loop over chuk_i_gek golden questions; each iteration process.call → tools+skills combiner with input query.',
      isActive: true,
      triggers: [
        { type: 'manual' },
        {
          type: 'mcp_tool',
          toolName: TOOL_NAME,
          description:
            'Run the CLI agents combiner once per golden-dataset question (sequential).',
        },
      ],
    },
    nodes,
    edges,
  };
}

/** Force isPort flags on root widgets and on loop body snapshots. */
function patchPortFlags(diagram) {
  let changed = false;

  const fixConfig = (nt, config) => {
    if (!Array.isArray(config)) return config;
    return config.map((field) => {
      const name = field.name;
      let next = field;
      if (nt === 'system.output') {
        if (field.isPort !== true) {
          changed = true;
          next = { ...field, isPort: true, canBePort: true };
        }
      } else if (nt === 'system.trigger.input') {
        if (name !== 'trigger' && field.isPort !== true) {
          changed = true;
          next = {
            ...field,
            isPort: true,
            canBePort: true,
            type: field.type || 'string',
          };
        }
      } else if (nt === 'system.process.call') {
        if (name === 'diagramId' || name === 'diagramName') {
          if (field.isPort !== false) {
            changed = true;
            next = { ...field, isPort: false, canBePort: false };
          }
        } else if (field.isPort !== true) {
          changed = true;
          next = {
            ...field,
            isPort: true,
            canBePort: true,
            type: field.type || 'string',
          };
        }
      } else if (nt === 'plugin.execution.code') {
        if (['source', 'input'].includes(name) && field.isPort !== true) {
          changed = true;
          next = { ...field, isPort: true, canBePort: true };
        }
      } else if (nt === 'system.loop') {
        if (name === 'iterator' && field.isPort !== true) {
          changed = true;
          next = { ...field, isPort: true, canBePort: true };
        }
      }
      return next;
    });
  };

  for (const widget of diagram.widgets || []) {
    const nt = widget.source?.nodeType || '';
    const before = JSON.stringify(widget.config);
    widget.config = fixConfig(nt, widget.config || []);
    if (JSON.stringify(widget.config) !== before) changed = true;

    if (nt === 'system.loop') {
      const bodyField = (widget.config || []).find((c) => c.name === 'body');
      const body = bodyField?.defaultValue;
      if (body && Array.isArray(body.widgets)) {
        for (const bw of body.widgets) {
          const bnt = bw.source?.nodeType || '';
          const bBefore = JSON.stringify(bw.config);
          bw.config = fixConfig(bnt, bw.config || []);
          if (JSON.stringify(bw.config) !== bBefore) changed = true;
        }
      }
    }
  }

  return changed;
}

async function ensurePorts(token, diagramId) {
  const res = await fetch(`${WEB}/diagram/${diagramId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const diagram = await res.json();
  if (!patchPortFlags(diagram)) {
    console.log('ports ok', diagramId);
    return;
  }
  const patch = await fetch(`${WEB}/diagram/${diagramId}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      widgets: diagram.widgets,
      edges: diagram.edges,
      settings: diagram.settings,
    }),
  });
  if (!patch.ok) {
    throw new Error(`ensurePorts: ${patch.status} ${await patch.text()}`);
  }
  console.log('patched ports', diagramId);
}

function verifyPorts(diagram) {
  const loop = (diagram.widgets || []).find(
    (w) => w.source?.nodeType === 'system.loop',
  );
  const body = loop?.config?.find((c) => c.name === 'body')?.defaultValue;
  const call = (body?.widgets || []).find(
    (w) => w.source?.nodeType === 'system.process.call',
  );
  const queryIn = (call?.config || []).find((c) => c.name === 'query');
  const out = (diagram.widgets || []).find(
    (w) => !w.parentId && w.source?.nodeType === 'system.output',
  );
  const itemsPort = (out?.config || []).find((c) => c.name === 'items');
  const report = {
    callQueryIsPort: queryIn?.isPort === true,
    callOutputs: call?.outputs?.length || 0,
    rootItemsIsPort: itemsPort?.isPort === true,
    bodyWidgetCount: body?.widgets?.length || 0,
    bodyEdgeCount: body?.edges?.length || 0,
  };
  report.ok =
    report.callQueryIsPort &&
    report.callOutputs > 0 &&
    report.rootItemsIsPort &&
    report.bodyWidgetCount >= 6;
  return report;
}

async function main() {
  const questions = loadQuestions();
  const token = await sessionToken();
  const sid = await openMcp(token);

  const combinerMeta = await findDiagram(token, COMBINER_TITLE);
  if (!combinerMeta?.id) {
    throw new Error(
      `combiner not found (${COMBINER_TITLE}); run apply-cli-combiner.mjs first`,
    );
  }
  const combiner = await (
    await fetch(`${WEB}/diagram/${combinerMeta.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  const callInputs = combinerCallInputs(combiner);
  const callOutputs = combinerCallOutputs(combiner);
  if (!callInputs.includes('query')) {
    throw new Error(
      'combiner trigger has no query output — re-apply apply-cli-combiner.mjs',
    );
  }
  console.log(
    'combiner',
    combinerMeta.id,
    'callInputs',
    callInputs,
    'callOutputs',
    callOutputs.length,
    'questions',
    questions.length,
  );

  let id = (await findDiagram(token, TITLE))?.id;
  if (!id) {
    const created = await fetch(`${WEB}/diagram`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: TITLE, folderId: FOLDER_ID }),
    });
    const text = await created.text();
    if (!created.ok) throw new Error(`create: ${created.status} ${text}`);
    id = JSON.parse(text).id;
    console.log('created', id);
  } else {
    console.log('reuse', id);
  }

  const graph = buildGraph(
    combinerMeta.id,
    callInputs,
    callOutputs,
    questions,
  );
  await mcpCall(
    token,
    sid,
    'process_apply',
    {
      diagramId: id,
      nodes: graph.nodes,
      edges: graph.edges,
      settings: graph.settings,
    },
    10,
  );
  console.log('applied', TITLE);

  await ensurePorts(token, id);

  const validated = await mcpCall(
    token,
    sid,
    'process_validate',
    { diagramId: id },
    11,
  );
  console.log('validate', JSON.stringify(validated).slice(0, 600));
  if (validated && validated.ok === false) {
    throw new Error(`validate failed: ${JSON.stringify(validated)}`);
  }

  await mcpCall(token, sid, 'process_publish', { diagramId: id }, 12);
  console.log('published', TOOL_NAME);

  const live = await (
    await fetch(`${WEB}/diagram/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  const ports = verifyPorts(live);
  console.log(
    JSON.stringify(
      {
        diagramId: id,
        toolName: TOOL_NAME,
        combinerId: combinerMeta.id,
        questionCount: questions.length,
        callInputs,
        callOutputs: callOutputs.length,
        ports,
      },
      null,
      2,
    ),
  );
  if (!ports.ok) {
    process.exitCode = 1;
  } else {
    console.log('DATASET_LOOP_WIRING_PASS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
