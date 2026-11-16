#!/usr/bin/env node
/**
 * Create/publish a single-agent Cursor demo process (graph-kg tools+skills).
 *
 *   WEB_BASE=http://localhost:18080 node scripts/apply-cursor-demo.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const FOLDER_ID =
  process.env.COMBINER_FOLDER_ID || 'ca314815-30d9-4f9a-9890-3a3a34275acd';
const TITLE = 'Курсор демо';
const TOOL_NAME = 'cli_agent_cursor_demo';
const PROTOCOL = '2025-03-26';
const API_KEY_REF = process.env.CLI_CURSOR_SECRET || 'cli-cursor-key';
const MODEL = process.env.CLI_CURSOR_MODEL || 'grok-4.7';
const here = dirname(fileURLToPath(import.meta.url));

const pack = JSON.parse(
  readFileSync(join(here, '../packs/graph-kg/pack.json'), 'utf8'),
);
const PACK_SKILL_NAMES = pack.skills || [
  'grounded-answer',
  'graph-kg',
  'vector-search',
];
const PACK_AGENTS_MD = readFileSync(
  join(here, '../packs/graph-kg/AGENTS.md'),
  'utf8',
);
const PACK_SKILL_BODIES = Object.fromEntries(
  PACK_SKILL_NAMES.map((name) => [
    name,
    readFileSync(
      join(here, '../packs/graph-kg/skills', name, 'SKILL.md'),
      'utf8',
    ),
  ]),
);

const RAG_SEARCH_META = {
  name: 'rag_search',
  description:
    'Dense vector search over chuk_i_gek (story «Чук и Гек»). Pass the user question or a tight paraphrase. Returns text chunks.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language search query' },
    },
    required: ['query'],
  },
};
const RAG_GRAPH_META = {
  name: 'rag_graph',
  description:
    'Knowledge-graph neighborhood for chuk_i_gek. Pass an entity or relation name (e.g. Чук, мать, ямщик).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Entity or relation name' },
    },
    required: ['query'],
  },
};
const RAG_SEARCH_SOURCE = readFileSync(
  join(here, '../packs/graph-kg/tools/rag_search.js'),
  'utf8',
);
const RAG_GRAPH_SOURCE = readFileSync(
  join(here, '../packs/graph-kg/tools/rag_graph.js'),
  'utf8',
);

const ANSWER_EXTRACTOR_SOURCE = `function (input) {
  var s = String(input == null ? '' : input).trim();
  if (!s) return '';
  var lines = s.split(/\\n/);
  var best = lines[lines.length - 1] || s;
  for (var i = 0; i < lines.length; i++) {
    var l = String(lines[i] || '').trim();
    if (!l) continue;
    if (l.length < 200 && l.charAt(0) !== '#' && l.indexOf('PROTOCOL') !== 0) best = l;
  }
  return String(best).slice(0, 2000);
}`;

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
  if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}: ${text.slice(0, 400)}`);
  const body = parseMcpBody(text);
  if (body.error) {
    throw new Error(`MCP ${name}: ${JSON.stringify(body.error)}`);
  }
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
        clientInfo: { name: 'apply-cursor-demo', version: '0' },
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

function buildGraph() {
  const nodes = [
    {
      id: 'trigger',
      nodeType: 'system.trigger.input',
      outputs: ['query', 'trigger'],
      config: [{ name: 'query', defaultValue: '', isPort: true }],
    },
    {
      id: 'ti_rag_search',
      nodeType: 'plugin.cli-agent.tool-instance',
      label: 'tool rag_search',
      outputs: ['instance'],
      config: [
        {
          name: 'meta',
          isPort: false,
          isPrimary: false,
          defaultValue: JSON.stringify(RAG_SEARCH_META),
        },
        {
          name: 'source',
          isPort: false,
          isPrimary: false,
          defaultValue: RAG_SEARCH_SOURCE,
        },
        {
          name: 'language',
          isPort: false,
          isPrimary: false,
          defaultValue: 'javascript',
        },
      ],
    },
    {
      id: 'ti_rag_graph',
      nodeType: 'plugin.cli-agent.tool-instance',
      label: 'tool rag_graph',
      outputs: ['instance'],
      config: [
        {
          name: 'meta',
          isPort: false,
          isPrimary: false,
          defaultValue: JSON.stringify(RAG_GRAPH_META),
        },
        {
          name: 'source',
          isPort: false,
          isPrimary: false,
          defaultValue: RAG_GRAPH_SOURCE,
        },
        {
          name: 'language',
          isPort: false,
          isPrimary: false,
          defaultValue: 'javascript',
        },
      ],
    },
    {
      id: 'tool_provider',
      nodeType: 'plugin.cli-agent.tool-provider',
      label: 'tool provider',
      outputs: ['mcpAttach'],
      config: [
        { name: 'rag_search', isPort: true, defaultValue: '' },
        { name: 'rag_graph', isPort: true, defaultValue: '' },
        {
          name: 'apiBase',
          isPort: false,
          isPrimary: false,
          defaultValue:
            process.env.CONVEYOR_API_BASE ||
            'http://host.docker.internal:18080',
        },
        {
          name: 'mcpBridgePath',
          isPort: false,
          isPrimary: false,
          defaultValue: '/tmp/tool-provider-mcp.mjs',
        },
      ],
    },
    ...PACK_SKILL_NAMES.map((name) => ({
      id: `si_${name.replace(/-/g, '_')}`,
      nodeType: 'plugin.cli-agent.skill-instance',
      label: `skill ${name}`,
      outputs: ['instance'],
      config: [
        {
          name: 'name',
          isPort: false,
          isPrimary: false,
          defaultValue: name,
        },
        {
          name: 'body',
          isPort: false,
          isPrimary: false,
          defaultValue: PACK_SKILL_BODIES[name],
        },
      ],
    })),
    {
      id: 'skill_provider',
      nodeType: 'plugin.cli-agent.skill-provider',
      label: 'skill provider',
      outputs: ['skillAttach'],
      config: PACK_SKILL_NAMES.map((name) => ({
        name: name.replace(/-/g, '_'),
        isPort: true,
        defaultValue: '',
      })),
    },
    {
      id: 'ri_agents',
      nodeType: 'plugin.cli-agent.rules-instance',
      label: 'rules AGENTS.md',
      outputs: ['instance'],
      config: [
        {
          name: 'name',
          isPort: false,
          isPrimary: false,
          defaultValue: 'AGENTS.md',
        },
        {
          name: 'body',
          isPort: false,
          isPrimary: false,
          defaultValue: PACK_AGENTS_MD,
        },
      ],
    },
    {
      id: 'rules_provider',
      nodeType: 'plugin.cli-agent.rules-provider',
      label: 'rules provider',
      outputs: ['rulesAttach'],
      config: [{ name: 'agents', isPort: true, defaultValue: '' }],
    },
    {
      id: 'agent',
      nodeType: 'plugin.cli-agent.cursor',
      label: 'Cursor',
      outputs: ['text', 'status', 'metricsJson', 'stdout', 'stderr'],
      config: [
        { name: 'task', isPort: true },
        {
          name: 'model',
          isPort: false,
          type: 'string',
          defaultValue: MODEL,
        },
        { name: 'tools', isPort: false, defaultValue: '[]' },
        { name: 'skills', isPort: false, defaultValue: '[]' },
        { name: 'mcpAttach', isPort: true, defaultValue: '' },
        { name: 'skillAttach', isPort: true, defaultValue: '' },
        { name: 'rulesAttach', isPort: true, defaultValue: '' },
        { name: 'timeoutMs', isPort: false, defaultValue: 600000 },
        {
          name: 'apiKey',
          isPort: false,
          type: 'ref',
          defaultValue: API_KEY_REF,
        },
      ],
    },
    {
      id: 'answer_extract',
      nodeType: 'plugin.execution.code',
      label: 'answer extract',
      outputs: ['value'],
      config: [
        {
          name: 'language',
          isPort: false,
          isPrimary: false,
          defaultValue: 'javascript',
        },
        {
          name: 'source',
          isPort: false,
          isPrimary: false,
          defaultValue: ANSWER_EXTRACTOR_SOURCE,
        },
        { name: 'input', isPort: true, defaultValue: '' },
        {
          name: 'timeoutMs',
          isPort: false,
          isPrimary: false,
          defaultValue: 5000,
        },
      ],
    },
    {
      id: 'output',
      nodeType: 'system.output',
      config: [
        { name: 'query', isPort: true, defaultValue: '' },
        { name: 'answer', isPort: true, defaultValue: '' },
        { name: 'text', isPort: true, defaultValue: '' },
        { name: 'status', isPort: true, defaultValue: '' },
        { name: 'metricsJson', isPort: true, defaultValue: '' },
        { name: 'stdout', isPort: true, defaultValue: '' },
        { name: 'stderr', isPort: true, defaultValue: '' },
      ],
    },
  ];

  const edges = [
    {
      source: 'ti_rag_search',
      target: 'tool_provider',
      sourceHandle: 'instance',
      targetHandle: 'rag_search',
    },
    {
      source: 'ti_rag_graph',
      target: 'tool_provider',
      sourceHandle: 'instance',
      targetHandle: 'rag_graph',
    },
    ...PACK_SKILL_NAMES.map((name) => ({
      source: `si_${name.replace(/-/g, '_')}`,
      target: 'skill_provider',
      sourceHandle: 'instance',
      targetHandle: name.replace(/-/g, '_'),
    })),
    {
      source: 'ri_agents',
      target: 'rules_provider',
      sourceHandle: 'instance',
      targetHandle: 'agents',
    },
    {
      source: 'trigger',
      target: 'agent',
      sourceHandle: 'query',
      targetHandle: 'task',
    },
    {
      source: 'tool_provider',
      target: 'agent',
      sourceHandle: 'mcpAttach',
      targetHandle: 'mcpAttach',
    },
    {
      source: 'skill_provider',
      target: 'agent',
      sourceHandle: 'skillAttach',
      targetHandle: 'skillAttach',
    },
    {
      source: 'rules_provider',
      target: 'agent',
      sourceHandle: 'rulesAttach',
      targetHandle: 'rulesAttach',
    },
    {
      source: 'agent',
      target: 'answer_extract',
      sourceHandle: 'text',
      targetHandle: 'input',
    },
    {
      source: 'trigger',
      target: 'output',
      sourceHandle: 'query',
      targetHandle: 'query',
    },
    {
      source: 'answer_extract',
      target: 'output',
      sourceHandle: 'value',
      targetHandle: 'answer',
    },
    {
      source: 'agent',
      target: 'output',
      sourceHandle: 'text',
      targetHandle: 'text',
    },
    {
      source: 'agent',
      target: 'output',
      sourceHandle: 'status',
      targetHandle: 'status',
    },
    {
      source: 'agent',
      target: 'output',
      sourceHandle: 'metricsJson',
      targetHandle: 'metricsJson',
    },
    {
      source: 'agent',
      target: 'output',
      sourceHandle: 'stdout',
      targetHandle: 'stdout',
    },
    {
      source: 'agent',
      target: 'output',
      sourceHandle: 'stderr',
      targetHandle: 'stderr',
    },
  ];

  return {
    settings: {
      name: TITLE,
      description:
        'Cursor CLI + graph-kg tool/skill providers (rag_search/rag_graph, grounded-answer/graph-kg/vector-search).',
      isActive: true,
      triggers: [
        { type: 'manual' },
        { type: 'webhook' },
        {
          type: 'mcp_tool',
          toolName: TOOL_NAME,
          description: 'Run Cursor demo with graph-kg MCP tools and skills.',
        },
      ],
    },
    nodes,
    edges,
  };
}

async function findExisting(token) {
  const res = await fetch(`${WEB}/diagram`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.items || [];
  for (const d of items) {
    const title = d.title || d.name || d.settings?.name;
    if (title === TITLE) return d.id;
  }
  return null;
}

async function createDiagram(token) {
  const res = await fetch(`${WEB}/diagram`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: TITLE, folderId: FOLDER_ID }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`create: ${res.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

function widgetSourceId(widget) {
  return widget.source?.id || widget.id;
}

async function ensurePorts(token, diagramId) {
  const res = await fetch(`${WEB}/diagram/${diagramId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const diagram = await res.json();
  let changed = false;

  const edges = diagram.edges || [];
  const incoming = new Map();
  const idOf = new Map();
  for (const w of diagram.widgets || []) {
    const sid = widgetSourceId(w);
    idOf.set(w.id, sid);
    idOf.set(sid, sid);
  }
  const resolve = (id) => idOf.get(id) || id;
  for (const e of edges) {
    const t = resolve(e.target);
    if (!incoming.has(t)) incoming.set(t, new Set());
    incoming.get(t).add(e.targetHandle);
  }

  const setField = (widget, name, patch) => {
    widget.config = (widget.config || []).map((field) => {
      if (field.name !== name) return field;
      let next = field;
      for (const [k, v] of Object.entries(patch)) {
        if (field[k] !== v) {
          if (next === field) next = { ...field };
          next[k] = v;
          changed = true;
        }
      }
      return next;
    });
  };

  const setOutputs = (widget, nextOuts) => {
    const prev = widget.outputs || [];
    if (
      prev.length === nextOuts.length &&
      prev.every((x, i) => x === nextOuts[i])
    ) {
      return;
    }
    widget.outputs = nextOuts;
    changed = true;
  };

  for (const widget of diagram.widgets || []) {
    const nt = widget.source?.nodeType || '';
    const sid = widgetSourceId(widget);
    const inWired = incoming.get(sid) || new Set();

    if (nt === 'system.output') {
      for (const field of widget.config || []) {
        if (field.isPort !== true) {
          setField(widget, field.name, { isPort: true, canBePort: true });
        }
      }
      continue;
    }
    if (nt === 'plugin.cli-agent.tool-instance') {
      setOutputs(widget, ['instance']);
      for (const name of ['meta', 'source', 'language']) {
        setField(widget, name, {
          isPort: false,
          canBePort: true,
          isPrimary: false,
        });
      }
      continue;
    }
    if (nt === 'plugin.cli-agent.tool-provider') {
      setOutputs(widget, ['mcpAttach']);
      const staticKeys = new Set(['apiBase', 'mcpBridgePath', 'serverId']);
      const before = (widget.config || []).length;
      widget.config = (widget.config || []).filter((field) => {
        if (staticKeys.has(field.name)) return true;
        return inWired.has(field.name);
      });
      if ((widget.config || []).length !== before) changed = true;
      for (const field of widget.config || []) {
        if (staticKeys.has(field.name)) {
          setField(widget, field.name, {
            isPort: false,
            canBePort: false,
            isPrimary: false,
          });
        } else {
          setField(widget, field.name, { isPort: true, canBePort: true });
        }
      }
      continue;
    }
    if (
      nt === 'plugin.cli-agent.skill-provider' ||
      nt === 'plugin.cli-agent.rules-provider'
    ) {
      setOutputs(
        widget,
        nt === 'plugin.cli-agent.skill-provider'
          ? ['skillAttach']
          : ['rulesAttach'],
      );
      const before = (widget.config || []).length;
      widget.config = (widget.config || []).filter((field) =>
        inWired.has(field.name),
      );
      if ((widget.config || []).length !== before) changed = true;
      for (const field of widget.config || []) {
        setField(widget, field.name, { isPort: true, canBePort: true });
      }
      continue;
    }
    if (
      nt === 'plugin.cli-agent.skill-instance' ||
      nt === 'plugin.cli-agent.rules-instance'
    ) {
      setOutputs(widget, ['instance']);
      for (const name of ['name', 'body']) {
        setField(widget, name, {
          isPort: false,
          canBePort: true,
          isPrimary: false,
        });
      }
      continue;
    }
    if (nt === 'plugin.cli-agent.cursor') {
      for (const name of [
        'task',
        'mcpAttach',
        'skillAttach',
        'rulesAttach',
      ]) {
        setField(widget, name, { isPort: true, canBePort: true });
      }
      setField(widget, 'tools', {
        isPort: false,
        canBePort: false,
        defaultValue: '[]',
      });
      setField(widget, 'skills', {
        isPort: false,
        canBePort: false,
        defaultValue: '[]',
      });
      setField(widget, 'model', {
        isPort: false,
        canBePort: false,
        type: 'string',
        defaultValue: MODEL,
      });
      setField(widget, 'timeoutMs', {
        isPort: false,
        canBePort: false,
        defaultValue: 600000,
      });
      // Preserve secret ref — do not wipe.
      setField(widget, 'apiKey', {
        isPort: false,
        canBePort: false,
        type: 'ref',
        defaultValue: API_KEY_REF,
      });
      // llmConfig unused: keep off the port wait-list if present.
      if ((widget.config || []).some((f) => f.name === 'llmConfig')) {
        setField(widget, 'llmConfig', {
          isPort: false,
          canBePort: true,
          defaultValue: '',
        });
      }
      continue;
    }
    if (nt === 'plugin.execution.code') {
      setField(widget, 'input', { isPort: true, canBePort: true });
      setField(widget, 'language', {
        isPort: false,
        isPrimary: false,
        defaultValue: 'javascript',
      });
      setField(widget, 'source', { isPort: false, isPrimary: false });
      setField(widget, 'timeoutMs', {
        isPort: false,
        isPrimary: false,
        defaultValue: 5000,
      });
    }
  }

  if (!changed) return;
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

async function main() {
  const token = await sessionToken();
  const sid = await openMcp(token);
  let id = process.env.CURSOR_DEMO_DIAGRAM_ID || (await findExisting(token));
  if (!id) {
    const created = await createDiagram(token);
    id = created.id;
    console.log('created', id);
  } else {
    console.log('reuse', id);
  }

  const apply = buildGraph();
  const saved = await mcpCall(
    token,
    sid,
    'process_apply',
    {
      diagramId: id,
      nodes: apply.nodes,
      edges: apply.edges,
      settings: apply.settings,
    },
    10,
  );
  console.log('applied', saved?.title || id);

  await ensurePorts(token, id);
  await mcpCall(token, sid, 'process_validate', { diagramId: id }, 11);
  await mcpCall(token, sid, 'process_publish', { diagramId: id }, 12);
  console.log(
    JSON.stringify(
      {
        diagramId: id,
        title: TITLE,
        toolName: TOOL_NAME,
        model: MODEL,
        apiKeyRef: API_KEY_REF,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
