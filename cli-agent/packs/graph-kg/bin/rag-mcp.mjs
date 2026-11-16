#!/usr/bin/env node
/**
 * Local stdio MCP server for graph-kg pack tools.
 * Exposes: rag_search, rag_graph (same backend as rag-lib.mjs).
 *
 * Framing: NDJSON by default (current MCP SDK / Hermes); Content-Length echoed
 * when the client speaks that wire format.
 *
 *   node rag-mcp.mjs
 *   # or: claude --mcp-config '{"mcpServers":{"graph-kg":{"command":"node","args":["/workspace/bin/rag-mcp.mjs"]}}}'
 */
const SERVER_INFO = { name: 'graph-kg', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

/** Match client wire format: modern MCP SDK uses NDJSON; older clients use Content-Length. */
let framing = 'ndjson';

const TOOLS = [
  {
    name: 'rag_search',
    description:
      'Dense vector search over chuk_i_gek (story «Чук и Гек»). Pass the user question or a tight paraphrase. Returns text chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language search query',
        },
      },
      required: ['query'],
    },
  },
  {
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
  },
];

function writeMessage(msg) {
  const json = JSON.stringify(msg);
  if (framing === 'content-length') {
    const body = Buffer.from(json, 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    process.stdout.write(Buffer.concat([header, body]));
    return;
  }
  process.stdout.write(`${json}\n`);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

async function runRag(kind, query) {
  // Dynamic import of sibling ESM (exports nothing — call via child for isolation
  // of process.stdout). Prefer in-process by duplicating the small API call.
  const BASE = process.env.CONVEYOR_API_BASE || 'http://host.docker.internal:18080';
  const IDS = {
    search: process.env.CHUK_SEARCH_DIAGRAM_ID || '0ebb1a12-871c-4eb5-af51-47a7bb6ec450',
    graph: process.env.CHUK_GRAPH_DIAGRAM_ID || '229933d8-e8d0-4b94-85ac-fc7c6af216e2',
  };
  const authRes = await fetch(`${BASE}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const auth = await authRes.json();
  if (!auth.accessToken) throw new Error('auth failed');
  const token = auth.accessToken;
  const diagramId = IDS[kind];
  const start = await fetch(`${BASE}/flow/${diagramId}/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const started = await start.json();
  const runId = started.runId;
  if (!runId) throw new Error(`start failed: ${JSON.stringify(started)}`);
  for (let i = 0; i < 90; i += 1) {
    const st = await fetch(`${BASE}/flow/${diagramId}/runs/${runId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (st.status === 404) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const body = await st.json();
    const status = body?.run?.status;
    if (['finished', 'failed', 'canceled', 'error'].includes(status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const result = await fetch(`${BASE}/flow/${diagramId}/runs/${runId}/result`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await result.json();
  const pi = data.publicInputs || data;
  if (kind === 'search') {
    const text = pi.context || pi.hits || data;
    return typeof text === 'string'
      ? text.slice(0, 12000)
      : JSON.stringify(text, null, 2).slice(0, 12000);
  }
  return String(pi.graphContext || pi.observations || data).slice(0, 12000);
}

async function handleCall(name, args) {
  const query = String(args?.query ?? '').trim();
  if (!query) throw new Error('query is required');
  if (name === 'rag_search') return runRag('search', query);
  if (name === 'rag_graph') return runRag('graph', query);
  throw new Error(`unknown tool: ${name}`);
}

async function onMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  if (method === 'initialize') {
    const requested =
      typeof params?.protocolVersion === 'string' && params.protocolVersion.trim()
        ? params.protocolVersion.trim()
        : PROTOCOL_VERSION;
    sendResult(id, {
      protocolVersion: requested,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'initialized') {
    return;
  }
  if (method === 'ping') {
    sendResult(id, {});
    return;
  }
  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS });
    return;
  }
  if (method === 'resources/list') {
    sendResult(id, { resources: [] });
    return;
  }
  if (method === 'prompts/list') {
    sendResult(id, { prompts: [] });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    try {
      const text = await handleCall(name, args);
      sendResult(id, {
        content: [{ type: 'text', text }],
        isError: false,
      });
    } catch (err) {
      const message = String(err?.stack || err);
      sendResult(id, {
        content: [{ type: 'text', text: message }],
        isError: true,
      });
    }
    return;
  }
  if (id !== undefined && method) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

/** Parse NDJSON or Content-Length framed JSON from stdin; reply in the same framing. */
function startStdio() {
  let buf = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length === 0) return;
      const peek = buf.slice(0, Math.min(buf.length, 32)).toString('utf8');
      if (/^\s*Content-Length:/i.test(peek)) {
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (headerEnd < 0) return;
        const header = buf.slice(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          buf = buf.slice(headerEnd + 4);
          continue;
        }
        framing = 'content-length';
        const len = Number(match[1]);
        const start = headerEnd + 4;
        if (buf.length < start + len) return;
        const body = buf.slice(start, start + len).toString('utf8');
        buf = buf.slice(start + len);
        try {
          void onMessage(JSON.parse(body));
        } catch (err) {
          process.stderr.write(`rag-mcp parse error: ${err}\n`);
        }
        continue;
      }
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      framing = 'ndjson';
      const line = buf.slice(0, nl).toString('utf8').trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        void onMessage(JSON.parse(line));
      } catch {
        // ignore partial
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

startStdio();
