#!/usr/bin/env node
/**
 * Wave A + Wave B combiner — same tools/skills fan-out to every agent.
 *
 * Pack mode (CLI_COMBINER_PACK):
 *   graph-kg (default) — tools=["search","graph"], skills=["grounded-answer","graph-kg","vector-search"]
 *   add-two            — tools=["add"], skills=["add-two"]
 *   none               — tools=[], skills=[] (no MCP / skills)
 *
 * LLM config (CLI_LLM):
 *   ollama (default) — plugin.cli-agent.llm-config → local gemma
 *   gigachat         — plugin.cli-agent.llm-config.gigachat (secret GIGACHAT_AUTH_KEY)
 *
 *   WEB_BASE=http://localhost:18080 node scripts/apply-cli-combiner.mjs
 *   CLI_COMBINER_PACK=add-two node scripts/apply-cli-combiner.mjs
 *   CLI_LLM=gigachat node scripts/apply-cli-combiner.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const FOLDER_ID =
  process.env.COMBINER_FOLDER_ID || 'ca314815-30d9-4f9a-9890-3a3a34275acd';
const TITLE = 'CLI agents: tools+skills combiner';
const TOOL_NAME = 'cli_agent_tools_skills_combiner';
const PROTOCOL = '2025-03-26';
const here = dirname(fileURLToPath(import.meta.url));

const PACKS = {
  'graph-kg': JSON.parse(
    readFileSync(join(here, '../packs/graph-kg/pack.json'), 'utf8'),
  ),
  'add-two': JSON.parse(
    readFileSync(join(here, '../packs/add-two/pack.json'), 'utf8'),
  ),
};

const PACK_MODE = (process.env.CLI_COMBINER_PACK || 'graph-kg').trim();
const PACK_OFF =
  PACK_MODE === 'none' || PACK_MODE === 'off' || PACK_MODE === 'empty';
const activePack = PACK_OFF ? null : PACKS[PACK_MODE] || PACKS['graph-kg'];
const TOOLS_JSON = activePack ? JSON.stringify(activePack.tools) : '[]';
const SKILLS_JSON = activePack ? JSON.stringify(activePack.skills) : '[]';
const PACK_ON = Boolean(activePack);
const USE_TOOL_PROVIDER = PACK_ON && (activePack?.id || '') === 'graph-kg';
/** Same graph-kg pack: skills/rules as external instances → providers (like tools). */
const USE_SKILL_PROVIDER = USE_TOOL_PROVIDER;
const PACK_SKILL_NAMES = USE_SKILL_PROVIDER
  ? activePack?.skills || ['grounded-answer', 'graph-kg', 'vector-search']
  : [];
const PACK_AGENTS_MD = USE_SKILL_PROVIDER
  ? readFileSync(join(here, '../packs/graph-kg/AGENTS.md'), 'utf8')
  : '';
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
      query: {
        type: 'string',
        description: 'Entity or relation name',
      },
    },
    required: ['query'],
  },
};
const RAG_SEARCH_SOURCE = USE_TOOL_PROVIDER
  ? readFileSync(join(here, '../packs/graph-kg/tools/rag_search.js'), 'utf8')
  : '';
const RAG_GRAPH_SOURCE = USE_TOOL_PROVIDER
  ? readFileSync(join(here, '../packs/graph-kg/tools/rag_graph.js'), 'utf8')
  : '';

const SHARED_MODEL = process.env.CLI_COMBINER_MODEL || 'gemma4:12b-mlx';

/** Proprietary CLIs: native model dropdown on the node (never SHARED_MODEL / ollama). */
const PROPRIETARY = {
  'claude-code': {
    defaultModel: process.env.CLI_COMBINER_MODEL_CLAUDE_CODE || 'sonnet',
    models: [
      'sonnet',
      'opus',
      'haiku',
      'fable',
      'claude-sonnet-4-5',
      'claude-opus-4-5',
      'claude-haiku-4-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
    ],
  },
  codex: {
    defaultModel: process.env.CLI_COMBINER_MODEL_CODEX || 'gpt-6.1-sol',
    models: [
      'gpt-6.1-sol',
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'o3',
      'o4-mini',
    ],
  },
  cursor: {
    defaultModel: process.env.CLI_COMBINER_MODEL_CURSOR || 'auto',
    models: [
      'auto',
      'composer-2.5',
      'grok-4.7',
      'gpt-5.6-sol',
      'sonnet-4.6',
      'opus-4.6',
      'gpt-5',
    ],
  },
};

function pickDatasetQuestion() {
  const path = join(here, 'smoke/chuk-gek/questions.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const list = data.questions || [];
  if (list.length === 0) {
    throw new Error(`no questions in ${path}`);
  }
  const idx = Math.floor(Math.random() * list.length);
  const q = list[idx];
  return {
    id: q.id,
    prompt: String(q.prompt || '').trim(),
    gold: q.gold ?? null,
    options: q.options ?? null,
  };
}

const DEFAULT_QUERIES = {
  'add-two':
    'What is 17 plus 25? Follow your skills. Reply with only the numeric sum.',
  none: 'What is 17 plus 25? Reply with only the numeric sum.',
};

/** graph-kg: question text only (tools/how-to live in pack skills). */
let DATASET_PICK = null;
let VERIFY_QUERY = (process.env.CLI_COMBINER_QUERY || '').trim();
if (!VERIFY_QUERY) {
  if (!PACK_OFF && (activePack?.id || 'graph-kg') === 'graph-kg') {
    DATASET_PICK = pickDatasetQuestion();
    VERIFY_QUERY = DATASET_PICK.prompt;
  } else {
    VERIFY_QUERY =
      DEFAULT_QUERIES[PACK_OFF ? 'none' : activePack?.id || 'none'] ||
      DEFAULT_QUERIES.none;
  }
}
const EMPTY_JSON = '[]';
/** Which llm-config implementation wires into every agent (same llmConfig port). */
const CLI_LLM = (process.env.CLI_LLM || 'ollama').trim().toLowerCase();
const LLM_GIGACHAT = CLI_LLM === 'gigachat';
/** apiKey on llm-config* is type `ref`: store secret *name*, not the raw key. */
const LLM = LLM_GIGACHAT
  ? {
      apiKey:
        process.env.CLI_COMBINER_GIGACHAT_SECRET || 'GIGACHAT_AUTH_KEY',
      scope: process.env.CLI_COMBINER_GIGACHAT_SCOPE || 'GIGACHAT_API_PERS',
      model: process.env.CLI_COMBINER_GIGACHAT_MODEL || 'GigaChat-2',
    }
  : {
      provider: 'ollama',
      model: SHARED_MODEL,
      baseUrl: 'http://host.docker.internal:11434/v1',
      apiKey:
        process.env.CLI_COMBINER_API_KEY_SECRET ||
        process.env.CLI_COMBINER_API_KEY ||
        'CLI_AGENT_API_KEY',
    };

/** Wave A + Wave B with runnable images. cline (arm64 bus error) / openhands (no headless CLI) excluded. */
const ALL_AGENTS = [
  { slug: 'hermes', nodeType: 'plugin.cli-agent.hermes', timeoutMs: 600000 },
  { slug: 'claude-code', nodeType: 'plugin.cli-agent.claude-code', timeoutMs: 600000 },
  { slug: 'codex', nodeType: 'plugin.cli-agent.codex', timeoutMs: 600000 },
  { slug: 'cursor', nodeType: 'plugin.cli-agent.cursor', timeoutMs: 600000 },
  // Aider headless is slow; hard 30s docker + shell timeout.
  { slug: 'aider', nodeType: 'plugin.cli-agent.aider', timeoutMs: 30000 },
  { slug: 'opencode', nodeType: 'plugin.cli-agent.opencode', timeoutMs: 600000 },
  { slug: 'zai', nodeType: 'plugin.cli-agent.zai', timeoutMs: 600000 },
  { slug: 'pi', nodeType: 'plugin.cli-agent.pi', timeoutMs: 600000 },
  { slug: 'kilo', nodeType: 'plugin.cli-agent.kilo', timeoutMs: 600000 },
  { slug: 'qwen', nodeType: 'plugin.cli-agent.qwen', timeoutMs: 600000 },
  { slug: 'goose', nodeType: 'plugin.cli-agent.goose', timeoutMs: 600000 },
  { slug: 'crush', nodeType: 'plugin.cli-agent.crush', timeoutMs: 600000 },
  { slug: 'openclaw', nodeType: 'plugin.cli-agent.openclaw', timeoutMs: 600000 },
];

/** Optional subset: CLI_COMBINER_AGENTS=crush,goose,aider — else keep agents already on canvas. */
let AGENTS = ALL_AGENTS;

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
        clientInfo: { name: 'apply-cli-combiner', version: '0' },
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

function agentId(slug) {
  return `agent_${slug.replace(/-/g, '_')}`;
}

function extractId(slug) {
  return `extract_${slug.replace(/-/g, '_')}`;
}

function answerExtractId(slug) {
  return `answer_${slug.replace(/-/g, '_')}`;
}

function resolveAgents(filterSlugs) {
  const filter = (filterSlugs || [])
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (
    filter.length === 0 ||
    filter.includes('all') ||
    filter.includes('*')
  ) {
    return ALL_AGENTS;
  }
  const agents = ALL_AGENTS.filter((a) => filter.includes(a.slug));
  if (agents.length === 0) {
    throw new Error(
      `CLI_COMBINER_AGENTS matched none; known: ${ALL_AGENTS.map((a) => a.slug).join(',')}`,
    );
  }
  return agents;
}

/** Stable layout key matching buildGraph node ids. */
function layoutKey(nodeType, label) {
  const nt = String(nodeType || '');
  const lb = String(label || '').trim();
  if (nt === 'system.trigger.input') return 'trigger';
  if (nt === 'system.control.constant') {
    if (lb === 'skills' || /skills/i.test(lb)) return 'skills';
    if (lb === 'tools' || /^tools$/i.test(lb)) return 'tools';
  }
  if (nt === 'plugin.cli-agent.llm-config') return 'llm_config';
  if (nt === 'plugin.cli-agent.tool-instance') {
    if (/rag_search/i.test(lb)) return 'ti_rag_search';
    if (/rag_graph/i.test(lb)) return 'ti_rag_graph';
  }
  if (nt === 'plugin.cli-agent.tool-provider') return 'tool_provider';
  if (nt === 'plugin.cli-agent.skill-provider') return 'skill_provider';
  if (nt === 'plugin.cli-agent.rules-provider') return 'rules_provider';
  if (nt === 'plugin.cli-agent.rules-instance') return 'ri_agents';
  if (nt === 'plugin.cli-agent.skill-instance') {
    const m = lb.match(/^skill\s+(.+)$/i);
    if (m) return `si_${m[1].trim().replace(/-/g, '_')}`;
  }
  if (nt === 'system.output') return 'output';
  if (nt === 'plugin.execution.code') {
    const m = lb.match(/^metrics\s+(.+)$/i);
    if (m) return extractId(m[1].trim());
    const a = lb.match(/^answer\s+(.+)$/i);
    if (a) return answerExtractId(a[1].trim());
  }
  if (
    nt.startsWith('plugin.cli-agent.') &&
    ![
      'plugin.cli-agent.llm-config',
      'plugin.cli-agent.tool-provider',
      'plugin.cli-agent.tool-instance',
      'plugin.cli-agent.skill-provider',
      'plugin.cli-agent.skill-instance',
      'plugin.cli-agent.rules-provider',
      'plugin.cli-agent.rules-instance',
    ].includes(nt)
  ) {
    return agentId(nt.slice('plugin.cli-agent.'.length));
  }
  return '';
}

function snapshotLayout(diagram) {
  const map = new Map();
  for (const w of diagram.widgets || []) {
    const nt = w.source?.nodeType || '';
    const label = w.label || w.source?.label || '';
    const key =
      w.id && !/^[0-9a-f-]{36}$/i.test(w.id) ? w.id : layoutKey(nt, label);
    if (!key || !w.position) continue;
    map.set(key, { x: w.position.x, y: w.position.y });
  }
  return map;
}

/** Agents already on the canvas (by nodeType), left-to-right. */
function agentsFromDiagram(diagram) {
  const rows = [];
  for (const w of diagram.widgets || []) {
    const nt = String(w.source?.nodeType || '');
    if (!nt.startsWith('plugin.cli-agent.')) continue;
    if (
      nt === 'plugin.cli-agent.llm-config' ||
      nt === 'plugin.cli-agent.tool-provider' ||
      nt === 'plugin.cli-agent.tool-instance' ||
      nt === 'plugin.cli-agent.skill-provider' ||
      nt === 'plugin.cli-agent.skill-instance' ||
      nt === 'plugin.cli-agent.rules-provider' ||
      nt === 'plugin.cli-agent.rules-instance'
    ) {
      continue;
    }
    rows.push({
      slug: nt.slice('plugin.cli-agent.'.length),
      x: w.position?.x ?? 0,
      y: w.position?.y ?? 0,
    });
  }
  rows.sort((a, b) => a.x - b.x || a.y - b.y);
  return rows.map((r) => r.slug);
}

async function restoreLayout(token, diagramId, layout) {
  if (!layout || layout.size === 0) return;
  const res = await fetch(`${WEB}/diagram/${diagramId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const diagram = await res.json();
  let changed = false;
  for (const w of diagram.widgets || []) {
    const nt = w.source?.nodeType || '';
    const label = w.label || w.source?.label || '';
    const key = layout.has(w.id) ? w.id : layoutKey(nt, label);
    const pos = layout.get(key);
    if (!pos) continue;
    if (w.position?.x !== pos.x || w.position?.y !== pos.y) {
      w.position = { x: pos.x, y: pos.y };
      changed = true;
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
    throw new Error(`restoreLayout: ${patch.status} ${await patch.text()}`);
  }
  console.log('restored layout', layout.size, 'keys');
}

/**
 * Enrich metricsJson using query + cleaned answer (runs before system.output).
 * Must be a `function (...)` body — execution sandbox wraps sources that contain `=>`.
 */
function metricsExtractorSource() {
  // Query comes from the run (extras.task), not a baked constant — process input port.
  return `
function (input) {
  var REFUSAL = /(?:i(?:'|\\s)?m sorry|i cannot|i can'?t help|as an ai|refuse|not able to|cannot assist)/i;
  function parseExpected(q) {
    var s = String(q || '');
    var m = s.match(/(?:reply with exactly|respond with exactly|return exactly|output exactly|exactly)\\s*[:：]?\\s*[«"']?(.+?)[»"']?\\s*$/im);
    if (m) return m[1].trim();
    var sum = s.match(/what is\\s+(-?\\d+(?:\\.\\d+)?)\\s+plus\\s+(-?\\d+(?:\\.\\d+)?)/i);
    if (sum) return String(Number(sum[1]) + Number(sum[2]));
    return null;
  }
  function cleanAnswer(text, expected) {
    var raw = String(text || '').trim();
    if (!raw) return '';
    var hermesBox = raw.match(/╭─[^\\n]*Hermes[^\\n]*╮\\r?\\n([\\s\\S]*?)\\r?\\n╰─/);
    if (hermesBox && hermesBox[1]) {
      var bodyLines = hermesBox[1].split(/\\r?\\n/);
      var bodyKept = [];
      for (var bi = 0; bi < bodyLines.length; bi++) {
        var bl = bodyLines[bi].trim();
        if (bl) bodyKept.push(bl);
      }
      if (bodyKept.length) return bodyKept.join('\\n').slice(0, 2000);
    }
    var terminal = raw.match(/"terminalReply"\\s*:\\s*\\{[^}]*?"text"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/);
    if (terminal && terminal[1] != null) {
      try { return JSON.parse('"' + terminal[1] + '"'); } catch (e) { return terminal[1]; }
    }
    if (raw.charAt(0) === '{' && raw.charAt(raw.length - 1) === '}') {
      try {
        var p = JSON.parse(raw);
        var nested = (p.terminalReply && p.terminalReply.text) || (p.result && p.result.text) || p.text || p.answer;
        if (typeof nested === 'string' && nested.trim()) return nested.trim();
      } catch (e) {}
    }
    var meta = /^(?:query\\s*:|tokens?\\s*:|messages?\\s*:|cost\\s*:|session\\s*:|title\\s*:|duration\\s*:|latency|prompt tokens|initializing |resume this session|hermes --resume|hermes -c |\\[diagnostic\\]|\\[openclaw\\])/i;
    var lines = raw.split(/\\r?\\n/);
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l && l.charAt(0) !== '{' && l.charAt(0) !== '[' && !meta.test(l)) kept.push(l);
    }
    if (expected) {
      var e = norm(expected);
      for (var j = 0; j < kept.length; j++) {
        if (norm(kept[j]) === e) return kept[j].slice(0, 2000);
      }
      for (var k = 0; k < kept.length; k++) {
        var toks = norm(kept[k]).split(' ').filter(Boolean);
        if (toks.length > 0 && toks.length <= 3 && toks.indexOf(e) >= 0) {
          return kept[k].slice(0, 2000);
        }
      }
      if (e && norm(raw).split(' ').indexOf(e) >= 0) return expected;
    }
    return (kept.length ? kept[kept.length - 1] : raw).slice(0, 2000);
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9а-яё\\s]+/gi, ' ').replace(/\\s+/g, ' ').trim();
  }
  function score(answer, expected) {
    if (!expected) return null;
    var a = norm(answer);
    var e = norm(expected);
    if (!a || !e) return 0;
    if (a === e) return 1;
    if (a.split(' ').indexOf(e) >= 0) return 1;
    if (a.indexOf(e) >= 0 && e.length >= 2) return 1;
    return 0;
  }
  var raw = typeof input === 'string' ? input : (input && input.metricsJson != null ? input.metricsJson : JSON.stringify(input));
  var m = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!m.extras) m.extras = {};
  var QUERY = String(m.extras.task || (input && input.query) || '');
  var expected = m.extras.expectedText || parseExpected(QUERY);
  var answer = cleanAnswer(m.extras.answerText || '', expected);
  var exact = score(answer, expected);
  m.extras.answerText = answer;
  m.extras.expectedText = expected;
  if (exact != null) {
    m.taskSuccessRate = exact;
    m.answerRelevance = exact;
    m.structuredOutputValidityRate = exact;
  }
  if (m.extras.status === 'ok' || m.extras.status === 'error') {
    m.retryRate = 0;
    m.fallbackModelRate = 0;
    if (m.extras.status === 'ok') m.taskAbandonmentRate = 0;
  }
  if (expected && m.extras.status === 'ok') {
    m.falseRefusalRate = REFUSAL.test(answer) && exact === 0 ? 1 : 0;
  }
  return JSON.stringify(m);
}
`.trim();
}

const ANSWER_EXTRACTOR_SOURCE = `
function (input) {
  var s = String(input == null ? '' : input).trim();
  if (!s) return '';
  var hermesBox = s.match(/╭─[^\\n]*Hermes[^\\n]*╮\\r?\\n([\\s\\S]*?)\\r?\\n╰─/);
  if (hermesBox && hermesBox[1]) {
    var bodyLines = hermesBox[1].split(/\\r?\\n/);
    var bodyKept = [];
    for (var bi = 0; bi < bodyLines.length; bi++) {
      var bl = bodyLines[bi].trim();
      if (bl) bodyKept.push(bl);
    }
    if (bodyKept.length) return bodyKept.join('\\n').slice(0, 2000);
  }
  var terminal = s.match(/"terminalReply"\\s*:\\s*\\{[^}]*?"text"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"/);
  if (terminal && terminal[1] != null) {
    try { return JSON.parse('"' + terminal[1] + '"'); } catch (e) { return terminal[1]; }
  }
  if (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') {
    try {
      var p = JSON.parse(s);
      var nested = (p.terminalReply && p.terminalReply.text) || (p.result && p.result.text) || p.text || p.answer;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    } catch (e) {}
  }
  var meta = /^(?:query\\s*:|tokens?\\s*:|messages?\\s*:|cost\\s*:|session\\s*:|title\\s*:|duration\\s*:|latency|prompt tokens|initializing |resume this session|hermes --resume|hermes -c |\\[diagnostic\\]|\\[openclaw\\])/i;
  var lines = s.split(/\\r?\\n/);
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim();
    if (l && l.charAt(0) !== '{' && l.charAt(0) !== '[' && !meta.test(l)) kept.push(l);
  }
  for (var j = 0; j < kept.length; j++) {
    if (/^-?\\d+(?:\\.\\d+)?$/.test(kept[j])) return kept[j];
  }
  return (kept.length ? kept[kept.length - 1] : s).slice(0, 2000);
}
`.trim();

function buildGraph() {
  const nodes = [
    {
      id: 'trigger',
      nodeType: 'system.trigger.input',
      label: 'input',
      // query is the process input port (process_start / process.call payload).
      outputs: ['query'],
      config: [
        { name: 'query', defaultValue: VERIFY_QUERY || '' },
      ],
    },
    {
      id: 'llm_config',
      nodeType: LLM_GIGACHAT
        ? 'plugin.cli-agent.llm-config.gigachat'
        : 'plugin.cli-agent.llm-config',
      label: LLM_GIGACHAT ? 'llm config (GigaChat)' : 'llm config',
      outputs: ['llmConfig'],
      config: LLM_GIGACHAT
        ? [
            {
              name: 'apiKey',
              type: 'ref',
              secretKind: 'GIGACHAT_AUTH_KEY',
              isPort: false,
              isPrimary: false,
              isRequired: false,
              defaultValue: LLM.apiKey,
            },
            {
              name: 'scope',
              type: 'string',
              isPort: false,
              isPrimary: false,
              defaultValue: LLM.scope,
            },
            {
              name: 'model',
              type: 'string',
              isPort: false,
              isPrimary: false,
              defaultValue: LLM.model,
            },
          ]
        : [
            {
              name: 'provider',
              type: 'string',
              isPort: false,
              isPrimary: false,
              defaultValue: LLM.provider,
            },
            {
              name: 'model',
              type: 'string',
              isPort: false,
              isPrimary: false,
              defaultValue: LLM.model,
            },
            {
              name: 'baseUrl',
              type: 'string',
              isPort: false,
              isPrimary: false,
              defaultValue: LLM.baseUrl,
            },
            {
              name: 'apiKey',
              type: 'ref',
              secretKind: 'CLI_AGENT_API_KEY',
              isPort: false,
              isPrimary: false,
              isRequired: false,
              defaultValue: LLM.apiKey,
            },
          ],
    },
    // tools constant only when there is no tool-provider (names come from instances).
    ...(!USE_TOOL_PROVIDER
      ? [
          {
            id: 'tools',
            nodeType: 'system.control.constant',
            label: 'tools',
            config: [{ name: 'value', defaultValue: TOOLS_JSON, isPort: false }],
          },
        ]
      : []),
    ...(!USE_SKILL_PROVIDER
      ? [
          {
            id: 'skills',
            nodeType: 'system.control.constant',
            label: 'skills',
            config: [{ name: 'value', defaultValue: SKILLS_JSON, isPort: false }],
          },
        ]
      : []),
    ...(USE_TOOL_PROVIDER
      ? [
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
        ]
      : []),
    ...(USE_SKILL_PROVIDER
      ? [
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
        ]
      : []),
  ];

  const edges = [];
  if (USE_TOOL_PROVIDER) {
    edges.push(
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
    );
  }
  if (USE_SKILL_PROVIDER) {
    for (const name of PACK_SKILL_NAMES) {
      edges.push({
        source: `si_${name.replace(/-/g, '_')}`,
        target: 'skill_provider',
        sourceHandle: 'instance',
        targetHandle: name.replace(/-/g, '_'),
      });
    }
    edges.push({
      source: 'ri_agents',
      target: 'rules_provider',
      sourceHandle: 'instance',
      targetHandle: 'agents',
    });
  }
  const outputConfig = [
    { name: 'query', isPort: true, defaultValue: '' },
    ...(USE_TOOL_PROVIDER
      ? []
      : [{ name: 'tools', isPort: true, defaultValue: '' }]),
    ...(USE_SKILL_PROVIDER
      ? []
      : [{ name: 'skills', isPort: true, defaultValue: '' }]),
  ];

  for (let i = 0; i < AGENTS.length; i += 1) {
    const agent = AGENTS[i];
    const id = agentId(agent.slug);
    const exId = extractId(agent.slug);
    const ansId = answerExtractId(agent.slug);
    const metricsKey = `metrics_${agent.slug.replace(/-/g, '_')}`;
    const statusKey = `status_${agent.slug.replace(/-/g, '_')}`;
    const answerKey = `answer_${agent.slug.replace(/-/g, '_')}`;
    const useToolProvider = USE_TOOL_PROVIDER;
    const useSkillProvider = USE_SKILL_PROVIDER;
    const proprietary = PROPRIETARY[agent.slug];
    const agentConfig = [
      { name: 'task', isPort: true },
      { name: 'llmConfig', isPort: true, defaultValue: '' },
      ...(proprietary
        ? [
            {
              name: 'model',
              isPort: false,
              type: 'select',
              defaultValue: proprietary.defaultModel,
              items: proprietary.models.map((m) => ({ label: m, value: m })),
            },
          ]
        : []),
      {
        name: 'tools',
        isPort: !useToolProvider,
        defaultValue: useToolProvider ? '[]' : TOOLS_JSON,
      },
      {
        name: 'skills',
        isPort: !useSkillProvider,
        defaultValue: useSkillProvider ? '[]' : SKILLS_JSON,
      },
      {
        name: 'mcpAttach',
        isPort: useToolProvider,
        defaultValue: '',
      },
      {
        name: 'skillAttach',
        isPort: useSkillProvider,
        defaultValue: '',
      },
      {
        name: 'rulesAttach',
        isPort: useSkillProvider,
        defaultValue: '',
      },
      { name: 'timeoutMs', isPort: false, defaultValue: agent.timeoutMs },
    ];
    // Sequential barrier: every agent after the first waits for previous enriched metrics.
    if (i > 0) {
      agentConfig.push({ name: 'awaiter', isPort: true, defaultValue: '' });
    }
    nodes.push({
      id,
      nodeType: agent.nodeType,
      label: agent.slug,
      outputs: ['text', 'status', 'metricsJson'],
      config: agentConfig,
    });
    nodes.push({
      id: exId,
      nodeType: 'plugin.execution.code',
      label: `metrics ${agent.slug}`,
      outputs: ['value'],
      config: [
        { name: 'language', isPort: false, isPrimary: false, defaultValue: 'javascript' },
        {
          name: 'source',
          isPort: false,
          isPrimary: false,
          defaultValue: metricsExtractorSource(),
        },
        { name: 'input', isPort: true, defaultValue: '' },
        { name: 'timeoutMs', isPort: false, isPrimary: false, defaultValue: 5000 },
      ],
    });
    nodes.push({
      id: ansId,
      nodeType: 'plugin.execution.code',
      label: `answer ${agent.slug}`,
      outputs: ['value'],
      config: [
        { name: 'language', isPort: false, isPrimary: false, defaultValue: 'javascript' },
        {
          name: 'source',
          isPort: false,
          isPrimary: false,
          defaultValue: ANSWER_EXTRACTOR_SOURCE,
        },
        { name: 'input', isPort: true, defaultValue: '' },
        { name: 'timeoutMs', isPort: false, isPrimary: false, defaultValue: 5000 },
      ],
    });
    edges.push(
      { source: 'trigger', target: id, sourceHandle: 'query', targetHandle: 'task' },
      {
        source: 'llm_config',
        target: id,
        sourceHandle: 'llmConfig',
        targetHandle: 'llmConfig',
      },
      {
        source: id,
        target: exId,
        sourceHandle: 'metricsJson',
        targetHandle: 'input',
      },
      {
        source: id,
        target: ansId,
        sourceHandle: 'text',
        targetHandle: 'input',
      },
    );
    if (!useSkillProvider) {
      edges.push({
        source: 'skills',
        target: id,
        sourceHandle: 'value',
        targetHandle: 'skills',
      });
    }
    if (!useToolProvider) {
      edges.push({
        source: 'tools',
        target: id,
        sourceHandle: 'value',
        targetHandle: 'tools',
      });
    }
    if (useToolProvider) {
      edges.push({
        source: 'tool_provider',
        target: id,
        sourceHandle: 'mcpAttach',
        targetHandle: 'mcpAttach',
      });
    }
    if (useSkillProvider) {
      edges.push(
        {
          source: 'skill_provider',
          target: id,
          sourceHandle: 'skillAttach',
          targetHandle: 'skillAttach',
        },
        {
          source: 'rules_provider',
          target: id,
          sourceHandle: 'rulesAttach',
          targetHandle: 'rulesAttach',
        },
      );
    }
    if (i > 0) {
      const prevEx = extractId(AGENTS[i - 1].slug);
      edges.push({
        source: prevEx,
        target: id,
        sourceHandle: 'value',
        targetHandle: 'awaiter',
      });
    }
    outputConfig.push(
      { name: metricsKey, isPort: true, defaultValue: '' },
      { name: statusKey, isPort: true, defaultValue: '' },
      { name: answerKey, isPort: true, defaultValue: '' },
    );
  }

  nodes.push({ id: 'output', nodeType: 'system.output', config: outputConfig });
  edges.push({
    source: 'trigger',
    target: 'output',
    sourceHandle: 'query',
    targetHandle: 'query',
  });
  if (!USE_SKILL_PROVIDER) {
    edges.push({
      source: 'skills',
      target: 'output',
      sourceHandle: 'value',
      targetHandle: 'skills',
    });
  }
  if (!USE_TOOL_PROVIDER) {
    edges.push({
      source: 'tools',
      target: 'output',
      sourceHandle: 'value',
      targetHandle: 'tools',
    });
  }
  for (const agent of AGENTS) {
    const id = agentId(agent.slug);
    const exId = extractId(agent.slug);
    const ansId = answerExtractId(agent.slug);
    const metricsKey = `metrics_${agent.slug.replace(/-/g, '_')}`;
    const statusKey = `status_${agent.slug.replace(/-/g, '_')}`;
    const answerKey = `answer_${agent.slug.replace(/-/g, '_')}`;
    edges.push(
      {
        source: exId,
        target: 'output',
        sourceHandle: 'value',
        targetHandle: metricsKey,
      },
      {
        source: id,
        target: 'output',
        sourceHandle: 'status',
        targetHandle: statusKey,
      },
      {
        source: ansId,
        target: 'output',
        sourceHandle: 'value',
        targetHandle: answerKey,
      },
    );
  }

  return {
    settings: {
      name: TITLE,
      description:
        'Wave A+B CLI agents in sequence (awaiter ← previous enriched metrics). Input port: query. Extractors enrich metricsJson + answer before system.output.',
      isActive: true,
      triggers: [
        { type: 'manual' },
        // Required so outer processes can system.process.call this diagram.
        { type: 'webhook' },
        {
          type: 'mcp_tool',
          toolName: TOOL_NAME,
          description:
            'Run all CLI agents sequentially on input query; returns enriched metricsJson + answer per agent.',
        },
      ],
    },
    nodes,
    edges,
  };
}

function widgetSourceId(widget) {
  return widget.source?.id || widget.id;
}

function hasDefault(field) {
  return (
    field.defaultValue !== undefined &&
    field.defaultValue !== null &&
    String(field.defaultValue).trim() !== ''
  );
}

/** Drop unused output handles; fix isPort so empty unused inputs cannot block the run. */
async function ensurePorts(token, diagramId) {
  const res = await fetch(`${WEB}/diagram/${diagramId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const diagram = await res.json();
  let changed = false;

  const edges = diagram.edges || [];
  const incoming = new Map(); // sourceId -> Set(targetHandle)
  const outgoing = new Map(); // sourceId -> Set(sourceHandle)
  const idOf = new Map();
  for (const w of diagram.widgets || []) {
    const sid = widgetSourceId(w);
    idOf.set(w.id, sid);
    idOf.set(sid, sid);
  }
  const resolve = (id) => idOf.get(id) || id;
  for (const e of edges) {
    const t = resolve(e.target);
    const s = resolve(e.source);
    if (!incoming.has(t)) incoming.set(t, new Set());
    if (!outgoing.has(s)) outgoing.set(s, new Set());
    incoming.get(t).add(e.targetHandle);
    outgoing.get(s).add(e.sourceHandle);
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
    const outWired = outgoing.get(sid) || new Set();

    if (nt === 'system.trigger.input') {
      // Only expose outputs that are actually used.
      const keep = (widget.outputs || []).filter((o) => outWired.has(o));
      setOutputs(widget, keep.length ? keep : ['query']);
      for (const field of widget.config || []) {
        if (field.name === 'trigger') continue;
        if (outWired.has(field.name)) {
          setField(widget, field.name, { isPort: true, canBePort: true });
        }
      }
      continue;
    }

    if (nt === 'system.output') {
      for (const field of widget.config || []) {
        setField(widget, field.name, { isPort: true, canBePort: true });
      }
      continue;
    }

    if (nt === 'plugin.execution.code') {
      setOutputs(widget, ['value']);
      setField(widget, 'input', { isPort: true, canBePort: true });
      // Source is baked in — must not be a waiting port.
      if (hasDefault((widget.config || []).find((f) => f.name === 'source') || {})) {
        setField(widget, 'source', {
          isPort: false,
          canBePort: true,
          isPrimary: false,
        });
      }
      continue;
    }

    if (
      nt === 'plugin.cli-agent.llm-config' ||
      nt === 'plugin.cli-agent.llm-config.gigachat'
    ) {
      setOutputs(widget, ['llmConfig']);
      const staticNames =
        nt === 'plugin.cli-agent.llm-config.gigachat'
          ? ['apiKey', 'scope', 'model']
          : ['provider', 'model', 'baseUrl', 'apiKey'];
      for (const name of staticNames) {
        setField(widget, name, {
          isPort: false,
          canBePort: true,
          isPrimary: false,
        });
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

    if (nt.startsWith('plugin.cli-agent.')) {
      // Agents: only keep outputs that are wired.
      const keepOut = ['text', 'status', 'metricsJson'].filter((o) =>
        outWired.has(o),
      );
      setOutputs(widget, keepOut.length ? keepOut : ['text', 'status', 'metricsJson']);

      for (const name of [
        'task',
        'llmConfig',
        'mcpAttach',
        'skillAttach',
        'rulesAttach',
      ]) {
        if ((widget.config || []).some((f) => f.name === name)) {
          setField(widget, name, { isPort: true, canBePort: true });
        }
      }
      if ((widget.config || []).some((f) => f.name === 'skills')) {
        setField(widget, 'skills', {
          isPort: false,
          canBePort: false,
          defaultValue: '[]',
        });
      }
      // awaiter only when sequenced (edge present).
      if ((widget.config || []).some((f) => f.name === 'awaiter')) {
        if (inWired.has('awaiter')) {
          setField(widget, 'awaiter', { isPort: true, canBePort: true });
        } else {
          setField(widget, 'awaiter', {
            isPort: false,
            canBePort: true,
            defaultValue: '',
          });
        }
      }
      {
        const slug = String(nt).split('.').pop();
        const proprietary = PROPRIETARY[slug];
        for (const name of ['provider', 'model', 'baseUrl', 'tools', 'apiKey']) {
          if (!(widget.config || []).some((f) => f.name === name)) continue;
          if (name === 'model' && proprietary) {
            const cur = (widget.config || []).find((f) => f.name === 'model');
            const curVal = String(cur?.defaultValue ?? '').trim();
            const keep =
              curVal &&
              proprietary.models.includes(curVal) &&
              curVal !== SHARED_MODEL
                ? curVal
                : proprietary.defaultModel;
            setField(widget, 'model', {
              isPort: false,
              canBePort: false,
              type: 'select',
              defaultValue: keep,
              items: proprietary.models.map((m) => ({ label: m, value: m })),
            });
            continue;
          }
          setField(widget, name, {
            isPort: false,
            canBePort: false,
            defaultValue: name === 'tools' || name === 'skills' ? '[]' : '',
          });
        }
      }
      // timeoutMs: keep static number; empty string → Number('')===0 → clamp 1s (exit 124).
      if ((widget.config || []).some((f) => f.name === 'timeoutMs')) {
        const cur = (widget.config || []).find((f) => f.name === 'timeoutMs');
        const n = Number(cur?.defaultValue);
        const slug = String(nt).split('.').pop();
        const fallback = slug === 'aider' ? 30_000 : 600_000;
        setField(widget, 'timeoutMs', {
          isPort: false,
          canBePort: false,
          defaultValue: Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback,
        });
      }
      // Drop legacy workspace field (skills/tools are ephemeral + mcpAttach).
      if ((widget.config || []).some((f) => f.name === 'workspace')) {
        widget.config = (widget.config || []).filter((f) => f.name !== 'workspace');
        changed = true;
      }
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

function verifyWiring(diagram) {
  const byId = new Map();
  for (const w of diagram.widgets || []) {
    byId.set(w.source?.id || w.id, w);
  }
  const edges = diagram.edges || [];
  const agents = (diagram.widgets || []).filter((w) => {
    const nt = String(w.source?.nodeType || '');
    if (!nt.startsWith('plugin.cli-agent.')) return false;
    // Tool pipeline nodes are not CLI agents.
    if (
      nt === 'plugin.cli-agent.llm-config' ||
      nt === 'plugin.cli-agent.tool-provider' ||
      nt === 'plugin.cli-agent.tool-instance' ||
      nt === 'plugin.cli-agent.skill-provider' ||
      nt === 'plugin.cli-agent.skill-instance' ||
      nt === 'plugin.cli-agent.rules-provider' ||
      nt === 'plugin.cli-agent.rules-instance'
    ) {
      return false;
    }
    return true;
  });
  const report = [];
  const agentOrder = agents.map((w) => w.source?.id || w.id);
  for (let i = 0; i < agents.length; i += 1) {
    const w = agents[i];
    const id = w.source?.id || w.id;
    const slug = w.label || w.source?.nodeType;
    const taskFrom = byId.get(
      edges.find((e) => e.target === id && e.targetHandle === 'task')?.source,
    );
    const toExtractor = edges.find(
      (e) => e.source === id && e.sourceHandle === 'metricsJson',
    );
    const extractorId = toExtractor?.target;
    const extractorIsCode =
      byId.get(extractorId)?.source?.nodeType === 'plugin.execution.code';
    const extractorToOutput = edges.some(
      (e) =>
        e.source === extractorId &&
        e.targetHandle &&
        String(e.targetHandle).startsWith('metrics_'),
    );
    const taskOk =
      taskFrom?.source?.nodeType === 'system.trigger.input' ||
      taskFrom?.source?.nodeType === 'system.control.constant' ||
      taskFrom?.label === 'query' ||
      taskFrom?.label === 'input';
    const metricsOut = Boolean(extractorIsCode && extractorToOutput);
    const awaiterEdge = edges.find(
      (e) => e.target === id && e.targetHandle === 'awaiter',
    );
    let sequenceOk = true;
    if (i === 0) {
      sequenceOk = !awaiterEdge;
    } else {
      const prevId = agentOrder[i - 1];
      const prevEx = edges.find(
        (e) =>
          e.source === prevId &&
          e.sourceHandle === 'metricsJson' &&
          byId.get(e.target)?.source?.nodeType === 'plugin.execution.code',
      )?.target;
      sequenceOk = Boolean(
        awaiterEdge &&
          prevEx &&
          awaiterEdge.source === prevEx &&
          awaiterEdge.sourceHandle === 'value',
      );
    }
    const mcpEdge = edges.find(
      (e) => e.target === id && e.targetHandle === 'mcpAttach',
    );
    const mcpFromProvider =
      byId.get(mcpEdge?.source)?.source?.nodeType ===
      'plugin.cli-agent.tool-provider';
    const mcpOk =
      (activePack?.id || '') !== 'graph-kg' || Boolean(mcpFromProvider);
    report.push({
      slug,
      taskOk,
      metricsOut,
      sequenceOk,
      mcpOk,
      ok: taskOk && metricsOut && sequenceOk && mcpOk,
    });
  }
  const output = (diagram.widgets || []).find(
    (w) => w.source?.nodeType === 'system.output',
  );
  const metricsPorts = (output?.config || []).filter((f) =>
    String(f.name || '').startsWith('metrics_'),
  ).length;
  const answerPorts = (output?.config || []).filter((f) =>
    String(f.name || '').startsWith('answer_'),
  ).length;
  return {
    agentCount: agents.length,
    metricsPorts,
    answerPorts,
    nodeCount: (diagram.widgets || []).length,
    edgeCount: edges.length,
    report,
  };
}

async function main() {
  const token = await sessionToken();
  const sid = await openMcp(token);

  const listRes = await fetch(`${WEB}/diagram`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  const diagrams = Array.isArray(listData) ? listData : listData.items || [];
  let id = diagrams.find(
    (d) => (d.title || d.name || d.settings?.name) === TITLE,
  )?.id;

  let layout = new Map();
  let existing = null;
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
    existing = await (
      await fetch(`${WEB}/diagram/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    layout = snapshotLayout(existing);
  }

  const envRaw = (process.env.CLI_COMBINER_AGENTS || '').trim();
  const envFilter = envRaw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const canvasAgents = existing ? agentsFromDiagram(existing) : [];
  // Explicit env wins (incl. all/*). Otherwise keep canvas subset; empty = full list.
  const agentFilter =
    envFilter.length > 0
      ? envFilter
      : canvasAgents.length > 0
        ? canvasAgents
        : ['all'];
  AGENTS = resolveAgents(agentFilter);
  if (envFilter.includes('all') || envFilter.includes('*')) {
    console.log('agents: full list', AGENTS.map((a) => a.slug).join(','));
  } else if (canvasAgents.length > 0 && envFilter.length === 0) {
    console.log(
      'preserve agents from canvas:',
      AGENTS.map((a) => a.slug).join(','),
    );
  }

  const graph = buildGraph();
  console.log(
    'nodes',
    graph.nodes.length,
    'edges',
    graph.edges.length,
    'agents',
    AGENTS.length,
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

  try {
    await ensurePorts(token, id);
  } catch (err) {
    console.warn(
      'ensurePorts skipped:',
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    await restoreLayout(token, id, layout);
  } catch (err) {
    console.warn(
      'restoreLayout skipped:',
      err instanceof Error ? err.message : String(err),
    );
  }

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
  const wiring = verifyWiring(live);
  const pass = wiring.report.filter((r) => r.ok).length;
  console.log(
    JSON.stringify(
      {
        diagramId: id,
        toolName: TOOL_NAME,
        pack: PACK_OFF ? 'none' : activePack?.id || PACK_MODE,
        tools: TOOLS_JSON,
        skills: SKILLS_JSON,
        sharedModel: SHARED_MODEL,
        query: VERIFY_QUERY,
        dataset: DATASET_PICK
          ? { id: DATASET_PICK.id, gold: DATASET_PICK.gold }
          : null,
        agents: AGENTS.map((a) => a.slug),
        metricsPorts: wiring.metricsPorts,
        nodeCount: wiring.nodeCount,
        edgeCount: wiring.edgeCount,
        wiringPass: pass,
        wiringTotal: wiring.agentCount,
      },
      null,
      2,
    ),
  );
  if (wiring.metricsPorts < wiring.agentCount || pass < wiring.agentCount) {
    process.exitCode = 1;
  } else {
    console.log('COMBINER_WIRING_PASS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
