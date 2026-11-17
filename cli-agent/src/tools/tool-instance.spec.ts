import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ToolInstanceExecutor } from './tool-instance.executor';
import { ToolProviderExecutor } from './tool-provider.executor';
import { parseMcpAttach } from './mcp-attach';

const META_SEARCH = {
  name: 'rag_search',
  description: 'Dense search',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

const META_GRAPH = {
  name: 'rag_graph',
  description: 'Graph neighborhood',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

describe('tool-instance → provider bind', () => {
  it('binds dynamic ports into mcpAttach', async () => {
    const ti = new ToolInstanceExecutor();
    const a = await ti.execute({
      inputs: { meta: META_SEARCH, source: 'async (input) => input.query' },
    } as never);
    assert.equal(a.status, 'ok');
    const b = await ti.execute({
      inputs: { meta: META_GRAPH, source: 'async (input) => "g:"+input.query' },
    } as never);
    assert.equal(b.status, 'ok');

    const provider = new ToolProviderExecutor();
    const out = await provider.execute({
      inputs: {
        rag_search: a.instance,
        rag_graph: b.instance,
        apiBase: 'http://host.docker.internal:18080',
      },
    } as never);
    assert.equal(out.status, 'ok');
    assert.ok(out.sessionId);
    assert.deepEqual(JSON.parse(out.toolNames), ['rag_search', 'rag_graph']);

    const attach = parseMcpAttach(out.mcpAttach);
    assert.ok(attach);
    assert.equal(attach!.servers[0].args[0], '/tmp/tool-provider-mcp.mjs');
    const toolsJson = attach!.servers[0].env?.TOOL_PROVIDER_TOOLS;
    assert.ok(toolsJson);
    const tools = JSON.parse(toolsJson!);
    assert.equal(tools.length, 2);
    assert.equal(tools[0].meta.name, 'rag_search');
    assert.equal(
      attach!.servers[0].env?.TOOL_PROVIDER_SESSION,
      out.sessionId,
    );
  });

  it('rejects provider without tool ports', async () => {
    const provider = new ToolProviderExecutor();
    const out = await provider.execute({ inputs: {} } as never);
    assert.match(out.status, /^error:/);
    assert.equal(out.mcpAttach, '');
  });
});
