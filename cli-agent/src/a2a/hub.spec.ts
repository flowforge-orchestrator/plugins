import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import type { CliAgentOutputDto } from '../contract/cli-agent.io';
import type { SpawnResult } from '../runtime/spawn';
import { parseFactoryConfig, runAgentFactory } from './factory';
import { FACTORY_AGENT_SLUGS, type AgentFactoryInputDto } from './factory.io';
import { appendProfile } from './profile/profile.executor';
import { startA2aHub, type A2aHub } from './hub';
import { A2aSession, type A2aLaunch } from './session';
import { a2aMcpServer, type A2aToolName } from './tools';

/** Same evaluation the in-container instance-mcp bridge performs. */
function toolsInContainer(hubUrl: string, launch: A2aLaunch) {
  const server = a2aMcpServer(hubUrl, launch.token, launch.tools);
  const instances = JSON.parse(server.env!.TOOL_PROVIDER_TOOLS) as Array<{
    meta: { name: A2aToolName };
    source: string;
  }>;
  const context = vm.createContext({
    fetch: globalThis.fetch.bind(globalThis),
    process: { env: { ...server.env } },
  });
  const tools = new Map<string, (input: unknown) => Promise<unknown>>();
  for (const i of instances) {
    tools.set(i.meta.name, new vm.Script(`(${i.source})`).runInContext(context));
  }
  return (name: A2aToolName, input: Record<string, unknown> = {}) => {
    const fn = tools.get(name);
    if (!fn) throw new Error(`${name} not exposed`);
    return fn(input) as Promise<any>;
  };
}

function out(text: string): CliAgentOutputDto {
  return {
    text,
    stdout: text,
    stderr: '',
    truncated: false,
    stdoutBytes: text.length,
    stderrBytes: 0,
    exitCode: 0,
    status: 'ok',
    usageKnown: false,
    workspaceMounted: false,
  };
}

describe('A2A hub over HTTP', () => {
  let hub: A2aHub;
  let base: string;

  before(async () => {
    hub = await startA2aHub({ port: 0, host: '127.0.0.1' });
    base = hub.url.replace('host.docker.internal', '127.0.0.1');
  });
  after(() => hub.close());

  it('hands agents a host.docker.internal URL with a host-gateway mapping', () => {
    assert.match(hub.url, /^http:\/\/host\.docker\.internal:\d+$/);
    assert.deepEqual(hub.extraHosts, ['host.docker.internal:host-gateway']);
  });

  it('rejects unknown tokens', async () => {
    const res = await fetch(`${base}/a2a/inbox`, {
      method: 'POST',
      headers: { authorization: 'Bearer nope' },
      body: '{}',
    });
    assert.equal(res.status, 401);
  });

  it('runs spawn → ask_parent → reply through the tool sources', async () => {
    const session = new A2aSession(
      {
        roster: [{ name: 'hermes', agent: 'hermes', description: '' }],
        maxAgents: 3,
        maxDepth: 1,
        budgetMs: 20_000,
        agentTimeoutMs: 10_000,
        waitSliceMs: 2_000,
      },
      async (launch) => {
        const tool = toolsInContainer(base, launch);
        if (launch.parentId === null) {
          const asked = await tool('a2a_spawn', { agent: 'hermes', task: 'translate' });
          const done = await tool('a2a_reply', { taskId: asked.taskId, message: 'French' });
          await assert.rejects(tool('a2a_wait', { taskId: 'a9' }), /not spawned by a1/);
          return out(`root: ${done.result}`);
        }
        const { answer } = await tool('a2a_ask_parent', { question: 'which language?' });
        return out(`bonjour (${answer})`);
      },
    );
    const unregister = hub.register(session);
    try {
      const result = await session.run('hermes', 'say hello');
      assert.equal(result.text, 'root: bonjour (French)');
      assert.equal(result.meta.totals.asks, 1);
      assert.equal(result.meta.totals.replies, 1);
    } finally {
      unregister();
    }
  });
});

describe('runAgentFactory', () => {
  const fakeHub: A2aHub = {
    url: 'http://host.docker.internal:9419',
    extraHosts: ['host.docker.internal:host-gateway'],
    register: () => () => undefined,
    close: async () => undefined,
  };
  const ok: SpawnResult = {
    exitCode: 0,
    timedOut: false,
    stdout: 'final answer',
    stderr: '',
    stdoutBytes: 12,
    stderrBytes: 0,
    truncated: false,
  };
  const base: AgentFactoryInputDto = {
    task: 'do it',
    orchestrator: 'hermes',
    llmConfig: JSON.stringify({ version: 1, provider: 'openai', model: 'm', baseUrl: '', apiKey: 'k' }),
  };

  it('runs the orchestrator with the a2a server and hub host mapping', async () => {
    let seenEnv = '';
    let seenHosts: string[] | undefined;
    const result = await runAgentFactory(base, fakeHub, async (spec, _t, signal) => {
      seenEnv = JSON.stringify({ env: spec.env, command: spec.command });
      seenHosts = spec.extraHosts;
      assert.equal(signal.aborted, false);
      return ok;
    });
    assert.equal(result.status, 'ok');
    assert.match(result.text, /final answer/);
    assert.deepEqual(seenHosts, ['host.docker.internal:host-gateway']);
    assert.match(seenEnv, /You are agent a1 \(hermes\)/);
    const meta = JSON.parse(result.meta);
    assert.equal(meta.version, 1);
    assert.deepEqual(meta.limits.roster, [{ name: 'hermes', agent: 'hermes', description: '' }]);
    assert.equal(meta.agents[0].state, 'completed');
  });

  it('rejects unknown roster agents without starting containers', async () => {
    const result = await runAgentFactory(
      { ...base, roster: '["hermes","nobody"]' },
      fakeHub,
      async () => {
        throw new Error('should not run');
      },
    );
    assert.equal(result.status, 'unsupported');
    assert.match(result.text, /nobody/);
  });

  it('keeps agents without an MCP client out of the team', async () => {
    assert.ok(!FACTORY_AGENT_SLUGS.includes('aider'));
    assert.ok(!FACTORY_AGENT_SLUGS.includes('pi'));
    assert.ok(FACTORY_AGENT_SLUGS.includes('hermes'));
    const result = await runAgentFactory({ ...base, roster: '["aider"]' }, fakeHub, async () => ok);
    assert.equal(result.status, 'unsupported');
    assert.match(result.text, /aider/);
  });

  it('gives each role its own attaches and the orchestrator the factory ones', async () => {
    const graphAttach = JSON.stringify({
      version: 1,
      servers: [{ id: 'tool-provider', transport: 'stdio', command: 'node', args: ['/tmp/tool-provider-mcp.mjs'] }],
      toolNames: ['rag_graph'],
    });
    const profiles = appendProfile({
      name: 'graph',
      agent: 'opencode',
      description: 'Graph specialist',
      mcpAttach: graphAttach,
    }).profiles;
    const hub = await startA2aHub({ port: 0, host: '127.0.0.1' });
    const local = hub.url.replace('host.docker.internal', '127.0.0.1');
    const specs: string[] = [];
    try {
      const result = await runAgentFactory(
        { ...base, orchestrator: 'opencode', profiles },
        hub,
        async (spec) => {
          const raw = JSON.stringify(spec);
          const blob = [raw, ...(raw.match(/[A-Za-z0-9+/=]{40,}/g) ?? [])]
            .map((s, i) => (i === 0 ? s : Buffer.from(s, 'base64').toString('utf8')))
            .join('\n');
          specs.push(blob);
          if (specs.length === 1) {
            const token = /A2A_TOKEN[\\"]+:[\\"]+([A-Za-z0-9_-]+)/.exec(blob)?.[1];
            const res = await fetch(`${local}/a2a/spawn`, {
              method: 'POST',
              headers: { authorization: `Bearer ${token}` },
              body: JSON.stringify({ agent: 'graph', task: 'find Чук' }),
            });
            const body = await res.json();
            return { ...ok, stdout: `child: ${body.result?.state}` };
          }
          return ok;
        },
      );
      const meta = JSON.parse(result.meta);
      assert.deepEqual(meta.limits.roster, [
        { name: 'graph', agent: 'opencode', description: 'Graph specialist' },
      ]);
      assert.deepEqual(meta.agents.map((a: { role: string }) => a.role), ['orchestrator', 'graph']);
    } finally {
      await hub.close();
    }
    assert.equal(specs.length, 2);
    assert.ok(!specs[0].includes('rag_graph'), 'orchestrator must not get the graph role tools');
    assert.ok(specs[1].includes('rag_graph'), 'graph role gets its own tools');
    assert.match(specs[1], /Graph specialist/);
  });

  it('rejects duplicate role names and the reserved orchestrator role', async () => {
    const one = appendProfile({ name: 'graph', agent: 'opencode' }).profiles;
    const dup = appendProfile({ name: 'graph', agent: 'kilo', profiles: one });
    assert.match(dup.status, /duplicate profile name/);
    const reserved = appendProfile({ name: 'orchestrator', agent: 'opencode' }).profiles;
    const result = await runAgentFactory({ ...base, profiles: reserved }, fakeHub, async () => ok);
    assert.equal(result.status, 'unsupported');
  });

  it('rejects malformed models JSON', async () => {
    const result = await runAgentFactory({ ...base, models: '[1]' }, fakeHub, async () => ok);
    assert.equal(result.status, 'unsupported');
  });

  it('accepts models already parsed into an object by the platform', () => {
    const parsed = parseFactoryConfig({ ...base, models: { cursor: 'composer-2.5' } as never });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.ok && parsed.config.models, { cursor: 'composer-2.5' });
  });
});
