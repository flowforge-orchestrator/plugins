import { randomBytes, randomUUID } from 'node:crypto';
import type { CliAgentOutputDto } from '../contract/cli-agent.io';
import { buildAgentPrompt, toolsForAgent, type A2aToolName } from './tools';

export type A2aState =
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export type A2aCallKind =
  | 'spawn'
  | 'ask'
  | 'reply'
  | 'message'
  | 'result'
  | 'cancel';

/** A role agents may spawn: `name` is what a2a_spawn takes, `agent` the CLI slug. */
export type A2aMember = {
  name: string;
  agent: string;
  description: string;
};

export const ORCHESTRATOR_ROLE = 'orchestrator';

export type A2aLimits = {
  roster: A2aMember[];
  maxAgents: number;
  maxDepth: number;
  budgetMs: number;
  agentTimeoutMs: number;
  waitSliceMs: number;
};

export type A2aLaunch = {
  agentId: string;
  role: string;
  slug: string;
  parentId: string | null;
  depth: number;
  prompt: string;
  token: string;
  tools: A2aToolName[];
  timeoutMs: number;
  signal: AbortSignal;
};

export type A2aLauncher = (launch: A2aLaunch) => Promise<CliAgentOutputDto>;

export class A2aError extends Error {}

type A2aMessage = { from: string; text: string; atMs: number };

type AgentRecord = {
  id: string;
  role: string;
  slug: string;
  parentId: string | null;
  depth: number;
  task: string;
  token: string;
  tools: A2aToolName[];
  state: A2aState;
  startedAtMs: number;
  endedAtMs?: number;
  question?: string;
  answers: string[];
  inbox: A2aMessage[];
  output?: CliAgentOutputDto;
  error?: string;
  controller: AbortController;
  done: Promise<void>;
  waiters: Set<() => void>;
};

type CallRecord = {
  seq: number;
  atMs: number;
  from: string;
  to: string;
  kind: A2aCallKind;
  preview: string;
};

export type A2aRunResult = {
  status: 'ok' | 'error';
  text: string;
  meta: A2aMeta;
};

export type A2aMeta = ReturnType<A2aSession['meta']>;

const SETTLED: ReadonlySet<A2aState> = new Set([
  'completed',
  'failed',
  'canceled',
]);
const MIN_AGENT_TIMEOUT_MS = 1_000;
const PREVIEW_CHARS = 400;
const RESULT_CHARS = 32_000;

function preview(text: string, max = PREVIEW_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function clip(text: string, max = RESULT_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…truncated`;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new A2aError(`"${key}" must be a non-empty string`);
  }
  return v.trim();
}

/**
 * One factory run: an agent tree whose members talk through hub tool calls.
 * Tool calls block at most `waitSliceMs` so MCP client timeouts never fire;
 * a still-working peer is reported as `working` and the caller polls again.
 */
export class A2aSession {
  readonly id = randomUUID();
  private readonly agents = new Map<string, AgentRecord>();
  private readonly byToken = new Map<string, AgentRecord>();
  private readonly calls: CallRecord[] = [];
  private readonly startedAt = Date.now();
  private seq = 0;
  private budgetExceeded = false;

  constructor(
    private readonly limits: A2aLimits,
    private readonly launcher: A2aLauncher,
  ) {}

  agentIdByToken(token: string): string | undefined {
    const rec = this.byToken.get(token);
    return rec && !SETTLED.has(rec.state) ? rec.id : undefined;
  }

  async run(orchestrator: string, task: string): Promise<A2aRunResult> {
    const budget = setTimeout(() => {
      this.budgetExceeded = true;
      for (const rec of this.agents.values()) {
        if (rec.parentId === null) this.cancel(rec, 'budget exceeded');
      }
    }, this.limits.budgetMs);
    try {
      const root = this.startAgent(
        { name: ORCHESTRATOR_ROLE, agent: orchestrator, description: '' },
        null,
        task,
      );
      await root.done;
      await Promise.allSettled([...this.agents.values()].map((a) => a.done));
      const ok = root.state === 'completed';
      return {
        status: ok ? 'ok' : 'error',
        text: root.output?.text || root.error || '',
        meta: this.meta(),
      };
    } finally {
      clearTimeout(budget);
      this.byToken.clear();
    }
  }

  async handle(
    callerId: string,
    op: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const caller = this.agents.get(callerId);
    if (!caller || SETTLED.has(caller.state)) {
      throw new A2aError('caller is not running');
    }
    if (!caller.tools.includes(`a2a_${op}` as A2aToolName)) {
      throw new A2aError(`tool a2a_${op} is not available to ${caller.id}`);
    }
    switch (op) {
      case 'spawn':
        return this.spawn(caller, args);
      case 'wait':
        return this.settle(this.childOf(caller, requireString(args, 'taskId')));
      case 'reply':
        return this.reply(caller, args);
      case 'ask_parent':
        return this.askParent(caller, args);
      case 'send':
        return this.send(caller, args);
      case 'inbox':
        return this.inbox(caller);
      default:
        throw new A2aError(`unknown operation ${op}`);
    }
  }

  meta() {
    const agents = [...this.agents.values()];
    const edges = new Map<string, { from: string; to: string; kind: A2aCallKind; count: number }>();
    for (const c of this.calls) {
      const key = `${c.from}>${c.to}>${c.kind}`;
      const edge = edges.get(key);
      if (edge) edge.count += 1;
      else edges.set(key, { from: c.from, to: c.to, kind: c.kind, count: 1 });
    }
    const byState: Partial<Record<A2aState, number>> = {};
    let usageKnown = agents.length > 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    for (const a of agents) {
      byState[a.state] = (byState[a.state] ?? 0) + 1;
      if (a.output?.usageKnown) {
        inputTokens += a.output.inputTokens ?? 0;
        outputTokens += a.output.outputTokens ?? 0;
        totalTokens += a.output.totalTokens ?? 0;
      } else {
        usageKnown = false;
      }
    }
    const kindCount = (kind: A2aCallKind) =>
      this.calls.filter((c) => c.kind === kind).length;
    return {
      version: 1 as const,
      sessionId: this.id,
      rootId: agents[0]?.id ?? null,
      latencyMs: Date.now() - this.startedAt,
      budgetExceeded: this.budgetExceeded,
      limits: this.limits,
      totals: {
        agents: agents.length,
        byState,
        maxDepthReached: agents.reduce((m, a) => Math.max(m, a.depth), 0),
        spawns: kindCount('spawn'),
        asks: kindCount('ask'),
        replies: kindCount('reply'),
        messages: kindCount('message'),
        cancels: kindCount('cancel'),
        usageKnown,
        inputTokens: usageKnown ? inputTokens : null,
        outputTokens: usageKnown ? outputTokens : null,
        totalTokens: usageKnown ? totalTokens : null,
      },
      agents: agents.map((a) => ({
        id: a.id,
        role: a.role,
        slug: a.slug,
        parentId: a.parentId,
        depth: a.depth,
        state: a.state,
        task: preview(a.task),
        result: a.output ? preview(a.output.text) : null,
        error: a.error ?? null,
        startedAtMs: a.startedAtMs,
        latencyMs: a.endedAtMs === undefined ? null : a.endedAtMs - a.startedAtMs,
        exitCode: a.output?.exitCode ?? null,
        status: a.output?.status ?? null,
        usage: a.output?.usageKnown
          ? {
              inputTokens: a.output.inputTokens ?? null,
              outputTokens: a.output.outputTokens ?? null,
              totalTokens: a.output.totalTokens ?? null,
            }
          : null,
        metrics: parseMetrics(a.output?.metricsJson),
      })),
      calls: this.calls,
      graph: {
        nodes: agents.map((a) => ({ id: a.id, role: a.role, slug: a.slug, state: a.state })),
        edges: [...edges.values()],
      },
    };
  }

  private startAgent(
    member: A2aMember,
    parent: AgentRecord | null,
    task: string,
  ): AgentRecord {
    const depth = parent ? parent.depth + 1 : 0;
    const id = `a${this.agents.size + 1}`;
    const slug = member.agent;
    const tools = toolsForAgent({ isRoot: parent === null, depth, maxDepth: this.limits.maxDepth });
    const rec: AgentRecord = {
      id,
      role: member.name,
      slug,
      parentId: parent?.id ?? null,
      depth,
      task,
      token: randomBytes(24).toString('base64url'),
      tools,
      state: 'working',
      startedAtMs: this.elapsed(),
      answers: [],
      inbox: [],
      controller: new AbortController(),
      done: Promise.resolve(),
      waiters: new Set(),
    };
    this.agents.set(id, rec);
    this.byToken.set(rec.token, rec);
    if (parent) this.record(parent.id, id, 'spawn', task);
    const timeoutMs = Math.max(
      MIN_AGENT_TIMEOUT_MS,
      Math.min(this.limits.agentTimeoutMs, this.remainingBudget()),
    );
    const prompt = buildAgentPrompt({
      agentId: id,
      member,
      parentId: rec.parentId,
      tools,
      roster: this.limits.roster,
      spawnsLeft: this.limits.maxAgents - this.agents.size,
      task,
    });
    rec.done = this.launcher({
      agentId: id,
      role: member.name,
      slug,
      parentId: rec.parentId,
      depth,
      prompt,
      token: rec.token,
      tools,
      timeoutMs,
      signal: rec.controller.signal,
    }).then(
      (output) => this.finish(rec, output),
      (error: unknown) =>
        this.finish(rec, undefined, error instanceof Error ? error.message : String(error)),
    );
    return rec;
  }

  private finish(rec: AgentRecord, output?: CliAgentOutputDto, error?: string): void {
    rec.output = output;
    rec.endedAtMs = this.elapsed();
    if (rec.state !== 'canceled') {
      rec.state = output?.status === 'ok' ? 'completed' : 'failed';
      if (rec.state === 'failed') {
        rec.error = error ?? (output ? `agent ${output.status}: ${preview(output.text, 200)}` : 'agent failed');
      }
      this.record(rec.id, rec.parentId ?? 'factory', 'result', output?.text ?? rec.error ?? '');
    }
    this.byToken.delete(rec.token);
    for (const child of this.childrenOf(rec)) {
      if (!SETTLED.has(child.state)) this.cancel(child, `parent ${rec.id} finished`);
    }
    this.notify(rec);
  }

  private cancel(rec: AgentRecord, reason: string): void {
    if (SETTLED.has(rec.state)) return;
    rec.state = 'canceled';
    rec.error = reason;
    rec.endedAtMs = this.elapsed();
    this.record(rec.parentId ?? 'factory', rec.id, 'cancel', reason);
    rec.controller.abort();
    for (const child of this.childrenOf(rec)) this.cancel(child, reason);
    this.notify(rec);
  }

  private async spawn(caller: AgentRecord, args: Record<string, unknown>) {
    const agent = requireString(args, 'agent');
    const task = requireString(args, 'task');
    const member = this.limits.roster.find((m) => m.name === agent);
    if (!member) {
      throw new A2aError(
        `agent "${agent}" is not in roster: ${this.limits.roster.map((m) => m.name).join(', ')}`,
      );
    }
    if (this.agents.size >= this.limits.maxAgents) {
      throw new A2aError(`agent limit reached (${this.limits.maxAgents}); finish the work yourself`);
    }
    if (this.remainingBudget() < MIN_AGENT_TIMEOUT_MS) {
      throw new A2aError('time budget is exhausted; finish the work yourself');
    }
    const child = this.startAgent(member, caller, task);
    if (args.wait === false) {
      return this.snapshot(child);
    }
    return this.settle(child);
  }

  private async reply(caller: AgentRecord, args: Record<string, unknown>) {
    const child = this.childOf(caller, requireString(args, 'taskId'));
    const message = requireString(args, 'message');
    if (SETTLED.has(child.state)) {
      throw new A2aError(`task ${child.id} is already ${child.state}`);
    }
    child.answers.push(message);
    child.question = undefined;
    child.state = 'working';
    this.record(caller.id, child.id, 'reply', message);
    this.notify(child);
    return this.settle(child);
  }

  private async askParent(caller: AgentRecord, args: Record<string, unknown>) {
    const question = requireString(args, 'question');
    if (caller.parentId === null) {
      throw new A2aError('you are the root agent; there is no parent to ask');
    }
    if (caller.state !== 'input-required' || caller.question !== question) {
      caller.question = question;
      caller.state = 'input-required';
      this.record(caller.id, caller.parentId, 'ask', question);
      this.notify(caller);
    }
    const deadline = Date.now() + this.limits.waitSliceMs;
    for (;;) {
      const answer = caller.answers.shift();
      if (answer !== undefined) {
        return { answered: true, answer };
      }
      if (SETTLED.has(caller.state)) {
        throw new A2aError(`you are ${caller.state}`);
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        return {
          answered: false,
          hint: 'parent has not replied yet; call a2a_ask_parent again with the same question, or continue without it',
        };
      }
      await this.waitChange(caller, left);
    }
  }

  private send(caller: AgentRecord, args: Record<string, unknown>) {
    const to = requireString(args, 'to');
    const text = requireString(args, 'message');
    const peer = this.agents.get(to);
    if (!peer || peer.id === caller.id) {
      throw new A2aError(`unknown peer "${to}"; peers: ${this.peerIds(caller).join(', ') || 'none'}`);
    }
    if (SETTLED.has(peer.state)) {
      throw new A2aError(`peer ${to} is ${peer.state}`);
    }
    peer.inbox.push({ from: caller.id, text, atMs: this.elapsed() });
    this.record(caller.id, to, 'message', text);
    this.notify(peer);
    return { delivered: true, to };
  }

  private inbox(caller: AgentRecord) {
    const messages = caller.inbox.splice(0);
    const children = this.childrenOf(caller).map((c) => this.snapshot(c));
    return {
      messages,
      children,
      peers: this.peerIds(caller),
    };
  }

  private async settle(child: AgentRecord) {
    const deadline = Date.now() + this.limits.waitSliceMs;
    while (child.state === 'working') {
      const left = deadline - Date.now();
      if (left <= 0) break;
      await this.waitChange(child, left);
    }
    return this.snapshot(child);
  }

  private snapshot(child: AgentRecord) {
    const base = { taskId: child.id, agent: child.role, state: child.state };
    switch (child.state) {
      case 'working':
        return { ...base, hint: 'still working; call a2a_wait with this taskId' };
      case 'input-required':
        return { ...base, question: child.question, hint: 'answer with a2a_reply' };
      case 'completed':
        return { ...base, result: clip(child.output?.text ?? '') };
      default:
        return { ...base, error: child.error ?? '' };
    }
  }

  private childOf(caller: AgentRecord, taskId: string): AgentRecord {
    const child = this.agents.get(taskId);
    if (!child || child.parentId !== caller.id) {
      throw new A2aError(`task ${taskId} was not spawned by ${caller.id}`);
    }
    return child;
  }

  private childrenOf(rec: AgentRecord): AgentRecord[] {
    return [...this.agents.values()].filter((a) => a.parentId === rec.id);
  }

  private peerIds(caller: AgentRecord): string[] {
    return [...this.agents.values()]
      .filter((a) => a.id !== caller.id && !SETTLED.has(a.state))
      .map((a) => a.id);
  }

  private waitChange(rec: AgentRecord, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        rec.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      rec.waiters.add(done);
    });
  }

  private notify(rec: AgentRecord): void {
    for (const w of [...rec.waiters]) w();
  }

  private record(from: string, to: string, kind: A2aCallKind, text: string): void {
    this.seq += 1;
    this.calls.push({ seq: this.seq, atMs: this.elapsed(), from, to, kind, preview: preview(text) });
  }

  private elapsed(): number {
    return Date.now() - this.startedAt;
  }

  private remainingBudget(): number {
    return this.limits.budgetMs - this.elapsed();
  }
}

function parseMetrics(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
