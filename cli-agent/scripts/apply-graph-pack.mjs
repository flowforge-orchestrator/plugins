#!/usr/bin/env node
/**
 * Create/update/publish Graph pack processes for all seven Wave A agents.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/apply-graph-pack.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const FOLDER_ID =
  process.env.GRAPH_PACK_FOLDER_ID || 'ca314815-30d9-4f9a-9890-3a3a34275acd';
const PROTOCOL = '2025-03-26';
const here = dirname(fileURLToPath(import.meta.url));
const native = JSON.parse(
  readFileSync(join(here, 'graph-pack-native.json'), 'utf8'),
);
const templateRaw = readFileSync(
  join(here, 'process-graph.graph-pack.template.json'),
  'utf8',
);

const KNOWN = {
  hermes: '72e7a508-4475-4024-a301-e99d9ced6899',
  'claude-code': 'c7af1365-e3e0-4fdc-9e3e-3c1799a1fcf9',
  opencode: '3adae966-0fef-492e-82f1-396a2368e867',
};

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
        clientInfo: { name: 'apply-graph-pack', version: '0' },
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

function buildApply(slug) {
  const cfg = native[slug];
  if (!cfg) throw new Error(`missing native config for ${slug}`);
  return JSON.parse(
    templateRaw
      .replaceAll('__TITLE__', cfg.title)
      .replaceAll('__TOOL_NAME__', cfg.toolName)
      .replaceAll('__NODE_TYPE__', cfg.nodeType)
      .replaceAll('"__TOOLS_JSON__"', JSON.stringify(cfg.tools))
      .replaceAll('"__SKILLS_JSON__"', JSON.stringify(cfg.skills)),
  );
}

async function listGraphPack(token) {
  const res = await fetch(`${WEB}/diagram`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.items || [];
  const byTitle = new Map();
  for (const d of items) {
    const title = d.title || d.name || d.settings?.name;
    if (title && String(title).startsWith('Graph pack:')) {
      byTitle.set(title, d.id);
    }
  }
  return byTitle;
}

async function ensureOutputPorts(token, diagramId) {
  const res = await fetch(`${WEB}/diagram/${diagramId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const diagram = await res.json();
  let changed = false;
  for (const widget of diagram.widgets || []) {
    if (widget.source?.nodeType !== 'system.output') continue;
    widget.config = (widget.config || []).map((field) => {
      if (field.isPort === true) return field;
      changed = true;
      return { ...field, isPort: true };
    });
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
    throw new Error(
      `ensureOutputPorts ${diagramId}: ${patch.status} ${await patch.text()}`,
    );
  }
  console.log('patched system.output isPort', diagramId);
}

async function createDiagram(token, title) {
  const res = await fetch(`${WEB}/diagram`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title, folderId: FOLDER_ID }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`create ${title}: ${res.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function main() {
  const token = await sessionToken();
  const sid = await openMcp(token);
  const existing = await listGraphPack(token);
  const ids = { ...KNOWN };

  for (const [slug, cfg] of Object.entries(native)) {
    let id = ids[slug] || existing.get(cfg.title);
    if (!id) {
      const created = await createDiagram(token, cfg.title);
      id = created.id;
      console.log('created', slug, id);
    } else {
      console.log('reuse', slug, id);
    }
    ids[slug] = id;

    const apply = buildApply(slug);
    const saved = await mcpCall(token, sid, 'process_apply', {
      diagramId: id,
      nodes: apply.nodes,
      edges: apply.edges,
      settings: apply.settings,
    }, 10);
    console.log('applied', slug, saved?.title || id);

    // process_apply can drop isPort on system.output; without it the sink
    // finishes on defaults before the agent runs.
    await ensureOutputPorts(token, id);

    await mcpCall(token, sid, 'process_validate', { diagramId: id }, 11);
    await mcpCall(token, sid, 'process_publish', { diagramId: id }, 12);
    console.log('published', slug);
  }

  console.log(JSON.stringify({ folderId: FOLDER_ID, ids }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
