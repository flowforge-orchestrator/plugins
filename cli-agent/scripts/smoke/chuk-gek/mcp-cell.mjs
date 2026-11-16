const PROTOCOL = '2025-11-25';

function header(headers, name) {
  if (!headers) {
    return '';
  }
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? '';
  }
  const value = headers[name] ?? headers[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
}

export function parseRpcBody(raw, contentType) {
  const type = contentType.toLowerCase();
  if (!type.includes('text/event-stream')) {
    return JSON.parse(raw);
  }
  const messages = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => JSON.parse(line));
  const last = messages.at(-1);
  if (!last) {
    throw new Error('MCP event stream had no JSON-RPC message');
  }
  return last;
}

export function unwrapToolPayload(rpc) {
  if (rpc.error) {
    const message = rpc.error.message ?? JSON.stringify(rpc.error);
    throw new Error(message);
  }
  const result = rpc.result ?? {};
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const text = result.content?.find((part) => part.type === 'text')?.text;
  if (typeof text === 'string' && text.trim()) {
    return JSON.parse(text);
  }
  return result;
}

export function createMcpClient({ baseUrl, token, fetchImpl = fetch }) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/mcp`;
  let sessionId = '';
  let protocol = PROTOCOL;
  let nextId = 1;

  async function rpc(method, params, { notify = false } = {}) {
    const body = notify
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id: nextId++, method, params };
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': protocol,
    };
    if (sessionId) {
      headers['MCP-Session-Id'] = sessionId;
    }
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const nextSession = header(response.headers, 'mcp-session-id');
    if (nextSession) {
      sessionId = nextSession;
    }
    if (notify) {
      if (!response.ok && response.status !== 202) {
        throw new Error(`MCP ${method} failed: ${response.status}`);
      }
      return null;
    }
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`MCP ${method} failed: ${response.status} ${raw}`);
    }
    const contentType = header(response.headers, 'content-type');
    return unwrapToolPayload({ result: undefined, ...parseRpcBody(raw, contentType) });
  }

  return {
    async connect() {
      const init = await rpc('initialize', {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'cli-agent-cell-smoke', version: '0.0.1' },
      });
      if (typeof init?.protocolVersion === 'string') {
        protocol = init.protocolVersion;
      }
      await rpc('notifications/initialized', {}, { notify: true });
    },
    call(name, args) {
      return rpc('tools/call', { name, arguments: args });
    },
  };
}
