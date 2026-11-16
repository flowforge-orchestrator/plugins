async function (input) {
  const query = String(input?.query ?? '').trim();
  if (!query) throw new Error('query is required');
  const BASE =
    globalThis.process?.env?.CONVEYOR_API_BASE ||
    'http://host.docker.internal:18080';
  const diagramId =
    globalThis.process?.env?.CHUK_GRAPH_DIAGRAM_ID ||
    '229933d8-e8d0-4b94-85ac-fc7c6af216e2';
  const authRes = await fetch(`${BASE}/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const auth = await authRes.json();
  if (!auth.accessToken) throw new Error('auth failed');
  const token = auth.accessToken;
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
  return String(pi.graphContext || pi.observations || data).slice(0, 12000);
}
