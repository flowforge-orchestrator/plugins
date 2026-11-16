/** Process Builder over the web API `/mcp` with a session token. */
const PROTOCOL = '2025-03-26';
const DYNAMIC_PROVIDERS = new Set([
  'plugin.cli-agent.tool-provider',
  'plugin.cli-agent.skill-provider',
  'plugin.cli-agent.rules-provider',
]);
const PROVIDER_STATIC_KEYS = new Set(['apiBase', 'mcpBridgePath', 'serverId']);

export function processBuilder(webBase, clientName) {
  const WEB = webBase.replace(/\/$/, '');
  let token = '';
  let sid = '';
  let callId = 1;

  const headers = () => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': PROTOCOL,
    ...(sid ? { 'mcp-session-id': sid } : {}),
  });

  function parseBody(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('data:')) return JSON.parse(line.slice(5).trim());
    }
    throw new Error(`unparseable MCP body: ${trimmed.slice(0, 200)}`);
  }

  async function open() {
    const auth = await (
      await fetch(`${WEB}/auth/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).json();
    if (!auth.accessToken) throw new Error('auth/session failed');
    token = auth.accessToken;
    const res = await fetch(`${WEB}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: clientName, version: '0' },
        },
      }),
    });
    sid = res.headers.get('mcp-session-id') || '';
    if (!sid) throw new Error('no mcp-session-id');
    await fetch(`${WEB}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
  }

  async function post(name, args) {
    callId += 1;
    return fetch(`${WEB}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
  }

  /** Session tokens expire within a long suite; reopen once on 401. */
  async function call(name, args) {
    let res = await post(name, args);
    if (res.status === 401) {
      await open();
      res = await post(name, args);
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}: ${text.slice(0, 400)}`);
    const body = parseBody(text);
    if (body.error) throw new Error(`MCP ${name}: ${JSON.stringify(body.error)}`);
    const content = body.result?.content?.[0]?.text;
    if (body.result?.isError) throw new Error(`MCP ${name}: ${content}`);
    if (typeof content !== 'string') return body.result;
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  async function ensureDiagram(title, folderId) {
    const list = await (
      await fetch(`${WEB}/diagram`, { headers: { authorization: `Bearer ${token}` } })
    ).json();
    const diagrams = Array.isArray(list) ? list : list.items || [];
    const found = diagrams.find((d) => (d.title || d.name || d.settings?.name) === title);
    if (found) return found.id;
    const created = await fetch(`${WEB}/diagram`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title, folderId }),
    });
    const text = await created.text();
    if (!created.ok) throw new Error(`create diagram: ${created.status} ${text}`);
    return JSON.parse(text).id;
  }

  /**
   * process_apply keeps only name/defaultValue for config items outside the library schema,
   * so dynamic inputs of providers lose isPort. Restore it on the stored diagram.
   */
  async function markProviderPorts(diagramId) {
    const res = await fetch(`${WEB}/diagram/${diagramId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const diagram = await res.json();
    let changed = 0;
    for (const widget of diagram.widgets || []) {
      if (!DYNAMIC_PROVIDERS.has(widget.source?.nodeType)) continue;
      widget.config = (widget.config || []).map((field) => {
        if (PROVIDER_STATIC_KEYS.has(field.name) || field.isPort === true) return field;
        changed += 1;
        return { ...field, isPort: true, canBePort: true };
      });
    }
    if (changed === 0) return 0;
    const patch = await fetch(`${WEB}/diagram/${diagramId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ widgets: diagram.widgets, edges: diagram.edges, settings: diagram.settings }),
    });
    if (!patch.ok) throw new Error(`markProviderPorts: ${patch.status} ${await patch.text()}`);
    return changed;
  }

  /** Start a published process and wait for a terminal state; returns run_result or run_status. */
  async function runToEnd(diagramId, payload, deadlineMs) {
    const started = await call('process_start', { diagramId, payload });
    const runId = started.runId || started.id;
    if (!runId) throw new Error(`process_start failed: ${JSON.stringify(started)}`);
    console.log('runId', runId);
    const deadline = Date.now() + deadlineMs;
    let waited = { status: 'running' };
    while (Date.now() < deadline) {
      waited = await call('run_wait', { diagramId, runId, timeoutMs: 60_000, pollIntervalMs: 2000 });
      console.log('run status', waited.status);
      if (['finished', 'failed', 'canceled', 'awaiting_user'].includes(waited.status)) break;
    }
    if (waited.status === 'finished') {
      return { runId, result: await call('run_result', { diagramId, runId }) };
    }
    return { runId, result: await call('run_status', { diagramId, runId }) };
  }

  return { open, call, ensureDiagram, markProviderPorts, runToEnd };
}
