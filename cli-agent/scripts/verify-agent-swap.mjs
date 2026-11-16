#!/usr/bin/env node
/**
 * Start each published cli_agent_* MCP tool with a tiny task and check:
 * - run finishes
 * - system.output has text/stdout
 * Same payload across agents → interchangeable contract.
 *
 *   WEB_BASE=http://localhost:18080 node scripts/verify-agent-swap.mjs
 *   ONLY=cli_agent_hermes,cli_agent_graph_hermes node scripts/verify-agent-swap.mjs
 */
const WEB = (process.env.WEB_BASE || 'http://localhost:18080').replace(/\/$/, '');
const ONLY = new Set(
  (process.env.ONLY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const TASK = process.env.SMOKE_TASK || 'Reply with exactly: pong';
const PROTOCOL = '2025-03-26';

async function session() {
  const res = await fetch(`${WEB}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error('auth failed');
  return data.accessToken;
}

function parseMcp(text) {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  for (const line of t.split('\n')) {
    if (line.startsWith('data:')) return JSON.parse(line.slice(5).trim());
  }
  throw new Error(`bad mcp: ${t.slice(0, 200)}`);
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
        clientInfo: { name: 'verify-agent-swap', version: '0' },
      },
    }),
  });
  const sid = res.headers.get('mcp-session-id');
  if (!sid) throw new Error('no session');
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

async function mcpCall(auth, name, args, id = 1) {
  const once = async () => {
    const res = await fetch(`${WEB}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': auth.sid,
        'mcp-protocol-version': PROTOCOL,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    return { status: res.status, text: await res.text() };
  };
  let { status, text } = await once();
  if (status === 401) {
    auth.token = await session();
    auth.sid = await openMcp(auth.token);
    ({ status, text } = await once());
  }
  const body = parseMcp(text);
  if (body.error) throw new Error(JSON.stringify(body.error));
  const content = body.result?.content?.[0]?.text;
  try {
    return content ? JSON.parse(content) : body.result;
  } catch {
    return content;
  }
}

function payloadFor(toolName) {
  const base = {
    task: TASK,
    provider: 'ollama',
    model: 'gemma4:12b-mlx',
    baseUrl: 'http://host.docker.internal:11434/v1',
    tools: '',
    skills: '',
    workspace: '',
    timeoutMs: 180000,
  };
  if (toolName.includes('aider')) {
    base.provider = 'custom';
    base.model = 'openai/gemma4:12b-mlx';
  }
  if (toolName.includes('graph_')) {
    base.workspace = '/var/lib/cli-agent/workspaces/graph-pack';
  }
  if (toolName.includes('_earth_') || toolName.includes('earth_')) {
    // earth processes keep default workspace empty
  }
  // proprietary without keys: still attempt start; may fail
  return base;
}

async function authFetch(auth, path, init = {}) {
  const once = async (t) =>
    fetch(`${WEB}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        authorization: `Bearer ${t}`,
      },
    });
  let res = await once(auth.token);
  if (res.status === 401) {
    auth.token = await session();
    res = await once(auth.token);
  }
  return res;
}

async function waitRun(auth, diagramId, runId) {
  let status = 'unknown';
  for (let i = 0; i < 120; i += 1) {
    const res = await authFetch(auth, `/flow/${diagramId}/runs/${runId}`);
    const body = await res.json();
    status = body?.run?.status || 'unknown';
    if (['finished', 'failed', 'canceled', 'error'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const resultRes = await authFetch(
    auth,
    `/flow/${diagramId}/runs/${runId}/result`,
  );
  const result = await resultRes.json();
  return { status, result };
}

async function main() {
  const auth = { token: await session(), sid: '' };
  auth.sid = await openMcp(auth.token);
  const listed = await mcpCall(auth, 'process_list', {}, 2);
  // Also tools/list via raw
  const toolsRes = await fetch(`${WEB}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': auth.sid,
      'mcp-protocol-version': PROTOCOL,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
    }),
  });
  const toolsBody = parseMcp(await toolsRes.text());
  const toolNames = (toolsBody.result?.tools || [])
    .map((t) => t.name)
    .filter((n) => n.startsWith('cli_agent_'));

  const processes = listed.processes || listed || [];
  const byTool = new Map();
  for (const p of processes) {
    for (const tr of p.triggers || []) {
      if (tr.type === 'mcp_tool' && String(tr.toolName || '').startsWith('cli_agent_')) {
        byTool.set(tr.toolName, p.id);
      }
    }
  }
  // merge tool names from tools/list even if process_list filtered
  for (const name of toolNames) {
    if (!byTool.has(name)) byTool.set(name, null);
  }

  const rows = [];
  for (const [toolName, diagramId] of [...byTool.entries()].sort()) {
    if (ONLY.size && !ONLY.has(toolName)) continue;
    const payload = payloadFor(toolName);
    console.log('start', toolName, diagramId || '(resolve via tool)');
    try {
      const started = await mcpCall(
        auth,
        toolName,
        payload,
        Math.floor(Math.random() * 1e6),
      );
      const runId = started?.runId;
      const did = started?.diagramId || diagramId;
      if (!runId || !did) {
        rows.push({
          toolName,
          ok: false,
          error: `no runId: ${JSON.stringify(started).slice(0, 200)}`,
        });
        console.log(JSON.stringify(rows[rows.length - 1]));
        continue;
      }
      const { status, result } = await waitRun(auth, did, runId);
      const pi = result?.publicInputs || result || {};
      const text = String(pi.text || pi.stdout || '');
      const hit = /pong/i.test(text);
      const row = {
        toolName,
        diagramId: did,
        ok: status === 'finished' && hit,
        status,
        hit,
        text: text.slice(-200),
      };
      rows.push(row);
      console.log(JSON.stringify({ ...row, text: (row.text || '').slice(0, 120) }));
    } catch (e) {
      rows.push({ toolName, ok: false, error: String(e).slice(0, 240) });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
  }

  const pass = rows.filter((r) => r.ok).length;
  console.log('---');
  console.log(JSON.stringify({ pass, total: rows.length, rows }, null, 2));
  if (pass < rows.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
