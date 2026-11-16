import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  codexMcpTomlFromAttach,
  gooseExtensionsYamlFromAttach,
  hermesMcpServersYaml,
  mcpConfigJsonFromAttach,
  opencodeMcpFromAttach,
  openclawMcpServersFromAttach,
  parseMcpAttach,
  zaiMcpServersFromAttach,
  type McpAttach,
} from './mcp-attach';

const SAMPLE: McpAttach = {
  version: 1,
  servers: [
    {
      id: 'graph-kg',
      transport: 'stdio',
      command: 'node',
      args: ['/workspace/bin/rag-mcp.mjs'],
      env: { CONVEYOR_API_BASE: 'http://host.docker.internal:18080' },
    },
  ],
  toolNames: ['rag_search', 'rag_graph'],
};

describe('mcp-attach', () => {
  it('round-trips opaque JSON from ToolProvider', () => {
    const raw = JSON.stringify(SAMPLE);
    const parsed = parseMcpAttach(raw);
    assert.deepEqual(parsed, SAMPLE);
  });

  it('rejects inventing servers from empty input', () => {
    assert.equal(parseMcpAttach(''), null);
    assert.equal(parseMcpAttach('{"version":1,"servers":[]}'), null);
  });

  it('emits Claude mcpServers JSON without pack hardcoding in adapters', () => {
    const json = JSON.parse(mcpConfigJsonFromAttach(SAMPLE));
    assert.equal(json.mcpServers['graph-kg'].args[0], '/workspace/bin/rag-mcp.mjs');
  });

  it('emits Hermes yaml from attach only', () => {
    const yaml = hermesMcpServersYaml(SAMPLE);
    assert.match(yaml, /^mcp_servers:\n/);
    assert.match(yaml, /rag-mcp\.mjs/);
    assert.match(yaml, /CONVEYOR_API_BASE/);
    // Bare `node` triggers Hermes isolated-runtime hang — must be absolute.
    assert.match(yaml, /command: "\/usr\/local\/bin\/node"/);
    assert.doesNotMatch(yaml, /command: "node"/);
    assert.match(yaml, /tool_search:\n {4}enabled: off/);
    assert.match(yaml, /disabled_toolsets:\n {4}- browser/);
    assert.doesNotMatch(yaml, /- terminal\n/);
    assert.doesNotMatch(yaml, /- code_execution\n/);
  });

  it('emits Codex toml, OpenCode mcp, Goose extensions, OpenClaw servers', () => {
    const toml = codexMcpTomlFromAttach(SAMPLE);
    assert.match(toml, /\[mcp_servers\.(?:"graph-kg"|graph-kg)\]/);
    assert.match(toml, /rag-mcp\.mjs/);
    const oc = opencodeMcpFromAttach(SAMPLE);
    assert.equal((oc['graph-kg'] as { type: string }).type, 'local');
    assert.equal((oc['graph-kg'] as { enabled: boolean }).enabled, true);
    const goose = gooseExtensionsYamlFromAttach(SAMPLE);
    assert.match(goose, /^extensions:\n/);
    assert.match(goose, /type: stdio/);
    const claw = openclawMcpServersFromAttach(SAMPLE);
    assert.equal((claw['graph-kg'] as { transport: string }).transport, 'stdio');
    const zai = zaiMcpServersFromAttach(SAMPLE);
    assert.equal((zai['graph-kg'] as { command: string }).command, 'node');
    assert.equal(
      Object.prototype.hasOwnProperty.call(zai['graph-kg'], 'transport'),
      false,
    );
  });
});
