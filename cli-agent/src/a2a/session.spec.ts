import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CliAgentOutputDto } from '../contract/cli-agent.io';
import {
  A2aSession,
  type A2aLaunch,
  type A2aLimits,
} from './session';

type Call = (op: string, args?: Record<string, unknown>) => Promise<any>;
type Behavior = (call: Call, launch: A2aLaunch) => Promise<string>;

const LIMITS: A2aLimits = {
  roster: [
    { name: 'hermes', agent: 'hermes', description: '' },
    { name: 'opencode', agent: 'opencode', description: '' },
    { name: 'graph', agent: 'opencode', description: 'Knowledge-graph specialist' },
  ],
  maxAgents: 6,
  maxDepth: 2,
  budgetMs: 60_000,
  agentTimeoutMs: 30_000,
  waitSliceMs: 2_000,
};

function out(text: string, status: CliAgentOutputDto['status'] = 'ok'): CliAgentOutputDto {
  return {
    text,
    stdout: text,
    stderr: '',
    truncated: false,
    stdoutBytes: text.length,
    stderrBytes: 0,
    exitCode: status === 'ok' ? 0 : 1,
    status,
    usageKnown: false,
    workspaceMounted: false,
  };
}

/** Behaviors keyed by agent id (a1 = root, then spawn order). */
function team(
  behaviors: Record<string, Behavior>,
  limits: Partial<A2aLimits> = {},
) {
  const launches: A2aLaunch[] = [];
  let session!: A2aSession;
  session = new A2aSession({ ...LIMITS, ...limits }, async (launch) => {
    launches.push(launch);
    const behavior = behaviors[launch.agentId];
    if (!behavior) return out(`${launch.agentId} done`);
    const call: Call = (op, args = {}) => session.handle(launch.agentId, op, args);
    try {
      const text = await behavior(call, launch);
      return launch.signal.aborted ? out('killed', 'error') : out(text);
    } catch (error) {
      return out(String(error), 'error');
    }
  });
  return { session, launches };
}

function untilAborted(signal: AbortSignal): Promise<string> {
  return new Promise((resolve) =>
    signal.addEventListener('abort', () => resolve('aborted'), { once: true }),
  );
}

describe('A2aSession', () => {
  it('returns the orchestrator answer when nobody is spawned', async () => {
    const { session, launches } = team({ a1: async () => '42' });
    const result = await session.run('hermes', 'answer');
    assert.equal(result.status, 'ok');
    assert.equal(result.text, '42');
    assert.equal(launches.length, 1);
    assert.equal(result.meta.totals.agents, 1);
    assert.deepEqual(result.meta.calls.map((c) => c.kind), ['result']);
  });

  it('prepends team instructions and the task to the agent prompt', async () => {
    const { session, launches } = team({});
    await session.run('hermes', 'count sheep');
    const prompt = launches[0].prompt;
    assert.match(prompt, /orchestrator/);
    assert.match(prompt, /a2a_spawn/);
    assert.match(prompt, /- hermes \(hermes\)\n- opencode \(opencode\)\n- graph: Knowledge-graph specialist/);
    assert.match(prompt, /Task:\ncount sheep$/);
    assert.ok(!launches[0].tools.includes('a2a_ask_parent'));
  });

  it('returns a child result to the spawning agent', async () => {
    const { session } = team({
      a1: async (call) => {
        const r = await call('spawn', { agent: 'opencode', task: 'sum 2+2' });
        return `child said ${r.result}`;
      },
      a2: async () => '4',
    });
    const result = await session.run('hermes', 'delegate');
    assert.equal(result.text, 'child said 4');
    const child = result.meta.agents[1];
    assert.equal(child.slug, 'opencode');
    assert.equal(child.parentId, 'a1');
    assert.equal(child.depth, 1);
    assert.equal(child.state, 'completed');
    assert.deepEqual(
      result.meta.graph.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort(),
      ['a1>a2:spawn', 'a1>factory:result', 'a2>a1:result'],
    );
  });

  it('spawns a role by name with its CLI agent and role description', async () => {
    const { session, launches } = team({
      a1: async (call) => (await call('spawn', { agent: 'graph', task: 'who?' })).result,
      a2: async () => 'Чук',
    });
    const result = await session.run('opencode', 'x');
    assert.equal(result.text, 'Чук');
    assert.equal(launches[1].role, 'graph');
    assert.equal(launches[1].slug, 'opencode');
    assert.match(launches[1].prompt, /role "graph" \(opencode\)/);
    assert.match(launches[1].prompt, /Your role: Knowledge-graph specialist/);
    assert.equal(result.meta.agents[0].role, 'orchestrator');
    assert.equal(result.meta.agents[1].role, 'graph');
  });

  it('runs children in parallel with wait:false and collects them with a2a_wait', async () => {
    const { session } = team({
      a1: async (call) => {
        const x = await call('spawn', { agent: 'hermes', task: 'x', wait: false });
        const y = await call('spawn', { agent: 'hermes', task: 'y', wait: false });
        assert.equal(x.state, 'working');
        const rx = await call('wait', { taskId: x.taskId });
        const ry = await call('wait', { taskId: y.taskId });
        return `${rx.result}+${ry.result}`;
      },
      a2: async () => 'X',
      a3: async () => 'Y',
    });
    const result = await session.run('hermes', 'fan out');
    assert.equal(result.text, 'X+Y');
    assert.equal(result.meta.totals.spawns, 2);
  });

  it('routes a child question to the parent and the reply back', async () => {
    const { session } = team({
      a1: async (call) => {
        const asked = await call('spawn', { agent: 'hermes', task: 'greet' });
        assert.equal(asked.state, 'input-required');
        assert.equal(asked.question, 'whom?');
        const done = await call('reply', { taskId: asked.taskId, message: 'Ann' });
        return done.result;
      },
      a2: async (call) => {
        const a = await call('ask_parent', { question: 'whom?' });
        return `hello ${a.answer}`;
      },
    });
    const result = await session.run('hermes', 'greet someone');
    assert.equal(result.text, 'hello Ann');
    assert.deepEqual(
      result.meta.calls.map((c) => `${c.kind}:${c.from}>${c.to}`),
      ['spawn:a1>a2', 'ask:a2>a1', 'reply:a1>a2', 'result:a2>a1', 'result:a1>factory'],
    );
  });

  it('reports working after one wait slice and lets the caller poll again', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { session } = team(
      {
        a1: async (call) => {
          const first = await call('spawn', { agent: 'hermes', task: 'slow' });
          assert.equal(first.state, 'working');
          assert.match(first.hint, /a2a_wait/);
          release();
          const second = await call('wait', { taskId: first.taskId });
          return second.result;
        },
        a2: async () => {
          await gate;
          return 'slow done';
        },
      },
      { waitSliceMs: 50 },
    );
    assert.equal((await session.run('hermes', 'x')).text, 'slow done');
  });

  it('delivers notes between peers through the inbox', async () => {
    const { session } = team({
      a1: async (call) => {
        const b = await call('spawn', { agent: 'hermes', task: 'listen', wait: false });
        await call('send', { to: b.taskId, message: 'ping' });
        return (await call('wait', { taskId: b.taskId })).result;
      },
      a2: async (call) => {
        for (;;) {
          const box = await call('inbox');
          if (box.messages.length > 0) return `got ${box.messages[0].text} from ${box.messages[0].from}`;
          await new Promise((r) => setTimeout(r, 5));
        }
      },
    });
    assert.equal((await session.run('hermes', 'x')).text, 'got ping from a1');
  });

  it('rejects agents outside the roster', async () => {
    const { session } = team({
      a1: async (call) => {
        await assert.rejects(call('spawn', { agent: 'cursor', task: 't' }), /not in roster/);
        return 'ok';
      },
    });
    assert.equal((await session.run('hermes', 'x')).status, 'ok');
  });

  it('stops spawning at maxAgents', async () => {
    const { session } = team(
      {
        a1: async (call) => {
          await call('spawn', { agent: 'hermes', task: 'one' });
          await assert.rejects(call('spawn', { agent: 'hermes', task: 'two' }), /agent limit/);
          return 'ok';
        },
      },
      { maxAgents: 2 },
    );
    assert.equal((await session.run('hermes', 'x')).meta.totals.agents, 2);
  });

  it('withholds spawn tools at maxDepth', async () => {
    const { session, launches } = team(
      {
        a1: async (call) => (await call('spawn', { agent: 'hermes', task: 'deep' })).result,
        a2: async (call) => {
          await assert.rejects(call('spawn', { agent: 'hermes', task: 'deeper' }), /not available/);
          return 'leaf';
        },
      },
      { maxDepth: 1 },
    );
    assert.equal((await session.run('hermes', 'x')).text, 'leaf');
    assert.deepEqual(launches[1].tools, ['a2a_ask_parent', 'a2a_send', 'a2a_inbox']);
    assert.match(launches[1].prompt, /cannot start agents/);
    assert.match(launches[1].prompt, /Do not calculate in your head/);
    assert.match(launches[1].prompt, /Model memory is not a source/);
  });

  it('refuses ask_parent for the orchestrator', async () => {
    const { session } = team({
      a1: async (call) => {
        await assert.rejects(call('ask_parent', { question: 'q' }), /not available/);
        return 'ok';
      },
    });
    await session.run('hermes', 'x');
  });

  it('refuses to wait on a task spawned by someone else', async () => {
    const { session } = team({
      a1: async (call) => {
        const b = await call('spawn', { agent: 'hermes', task: 'b', wait: false });
        await call('wait', { taskId: b.taskId });
        return 'ok';
      },
      a2: async (call) => {
        await assert.rejects(call('wait', { taskId: 'a1' }), /not spawned by a2/);
        return 'ok';
      },
    });
    assert.equal((await session.run('hermes', 'x')).status, 'ok');
  });

  it('reports a failed child to the parent', async () => {
    const { session } = team({
      a1: async (call) => {
        const r = await call('spawn', { agent: 'hermes', task: 'boom' });
        return `${r.state}: ${r.error}`;
      },
      a2: async () => {
        throw new Error('kaboom');
      },
    });
    const result = await session.run('hermes', 'x');
    assert.match(result.text, /^failed: agent error/);
    assert.equal(result.meta.totals.byState.failed, 1);
  });

  it('cancels running children when their parent finishes', async () => {
    const { session } = team({
      a1: async (call) => {
        await call('spawn', { agent: 'hermes', task: 'forever', wait: false });
        return 'parent done';
      },
      a2: async (_call, launch) => untilAborted(launch.signal),
    });
    const result = await session.run('hermes', 'x');
    assert.equal(result.status, 'ok');
    assert.equal(result.meta.agents[1].state, 'canceled');
    assert.match(String(result.meta.agents[1].error), /parent a1 finished/);
  });

  it('cancels the whole team when the budget runs out', async () => {
    const { session } = team(
      {
        a1: async (call, launch) => {
          await call('spawn', { agent: 'hermes', task: 'forever', wait: false });
          return untilAborted(launch.signal);
        },
        a2: async (_call, launch) => untilAborted(launch.signal),
      },
      { budgetMs: 1_200 },
    );
    const result = await session.run('hermes', 'x');
    assert.equal(result.status, 'error');
    assert.equal(result.meta.budgetExceeded, true);
    assert.deepEqual(result.meta.agents.map((a) => a.state), ['canceled', 'canceled']);
  });

  it('expires agent tokens once the agent finishes', async () => {
    let token = '';
    const { session } = team({
      a1: async (_call, launch) => {
        token = launch.token;
        assert.equal(session.agentIdByToken(token), 'a1');
        return 'ok';
      },
    });
    await session.run('hermes', 'x');
    assert.equal(session.agentIdByToken(token), undefined);
  });
});
