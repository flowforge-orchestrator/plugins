#!/usr/bin/env node
/**
 * Generic stdio MCP server bound to a ToolProvider run snapshot.
 *
 * Env:
 *   TOOL_PROVIDER_TOOLS — JSON array of ToolInstancePayload
 *     { version:1, meta:{name,description,inputSchema}, source, language }
 *
 * On tools/call: run the instance source as async/sync function(input) → text.
 */
import vm from 'node:vm';

const SERVER_INFO = { name: 'tool-provider', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

/** Match client wire format: modern MCP SDK uses NDJSON; older clients use Content-Length. */
let framing = 'ndjson';

function loadTools() {
  const raw = process.env.TOOL_PROVIDER_TOOLS || '[]';
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    throw new Error(`TOOL_PROVIDER_TOOLS JSON: ${err}`);
  }
  if (!Array.isArray(list)) throw new Error('TOOL_PROVIDER_TOOLS must be an array');
  const byName = new Map();
  for (const item of list) {
    const name = item?.meta?.name;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (typeof item.source !== 'string' || !item.source.trim()) continue;
    byName.set(name.trim(), item);
  }
  return byName;
}

const TOOLS = loadTools();

function writeMessage(msg) {
  const json = JSON.stringify(msg);
  if (framing === 'content-length') {
    const body = Buffer.from(json, 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    process.stdout.write(Buffer.concat([header, body]));
    return;
  }
  // NDJSON (Hermes / current mcp Python+TS SDK): one JSON object per line.
  process.stdout.write(`${json}\n`);
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function wrapSource(source) {
  const trimmed = source.trim();
  if (
    trimmed.startsWith('function') ||
    trimmed.startsWith('async ') ||
    trimmed.startsWith('(') ||
    trimmed.includes('=>')
  ) {
    return `"use strict";\nconst __fn = (${trimmed});\n__fn(input);`;
  }
  if (trimmed.includes('return')) {
    return `"use strict";\n(async function(input){\n${trimmed}\n})(input);`;
  }
  return `"use strict";\n(async function(input){\nreturn (${trimmed});\n})(input);`;
}

async function runInstance(source, input, timeoutMs = 120000) {
  const stdout = [];
  const stderr = [];
  const sandbox = Object.create(null);
  sandbox.input = input;
  sandbox.fetch = globalThis.fetch?.bind(globalThis);
  sandbox.setTimeout = globalThis.setTimeout;
  sandbox.process = { env: { ...process.env } };
  sandbox.globalThis = sandbox;
  sandbox.console = {
    log: (...args) => stdout.push(args.map(String).join(' ')),
    error: (...args) => stderr.push(args.map(String).join(' ')),
  };
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  let value = new vm.Script(wrapSource(source)).runInContext(context, {
    timeout: 5000,
  });
  if (value != null && typeof value.then === 'function') {
    value = await Promise.race([
      value,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('tool timed out')), timeoutMs),
      ),
    ]);
  }
  if (typeof value === 'string') return value;
  if (value == null) {
    return stdout.join('\n') || '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function listTools() {
  return [...TOOLS.values()].map((t) => ({
    name: t.meta.name,
    description: t.meta.description || '',
    inputSchema: t.meta.inputSchema || { type: 'object', properties: {} },
  }));
}

async function handleCall(name, args) {
  const tool = TOOLS.get(name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return runInstance(tool.source, args ?? {});
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
    sendResult(id, { tools: listTools() });
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
        content: [{ type: 'text', text: String(text) }],
        isError: false,
      });
    } catch (err) {
      sendResult(id, {
        content: [{ type: 'text', text: String(err?.stack || err) }],
        isError: true,
      });
    }
    return;
  }
  if (id !== undefined && method) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

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
          process.stderr.write(`instance-mcp parse error: ${err}\n`);
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
        // ignore
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

startStdio();
