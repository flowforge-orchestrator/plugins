import { getAdapter } from '../agents/registry';
import { executeCliAgent } from '../agents/execute';
import { parseJsonStringList } from '../agents/parse-json-list';
import {
  isProprietaryAgentSlug,
  PROPRIETARY_DEFAULT_MODEL,
} from '../contract/proprietary-models';
import { clampTimeout } from '../runtime/limits';
import type { ContainerSpec } from '../runtime/docker-args';
import { runContainer, type SpawnResult } from '../runtime/spawn';
import { parseMcpAttach } from '../tools/mcp-attach';
import {
  FACTORY_AGENT_SLUGS,
  FACTORY_DEFAULT_ORCHESTRATOR,
  type AgentFactoryInputDto,
  type AgentFactoryOutputDto,
} from './factory.io';
import type { A2aHub } from './hub';
import { parseProfiles, type AgentProfile } from './profile.types';
import {
  A2aSession,
  ORCHESTRATOR_ROLE,
  type A2aLauncher,
  type A2aLimits,
  type A2aMember,
} from './session';
import { a2aMcpServer, withA2aServer } from './tools';

export type FactoryRunner = (
  spec: ContainerSpec,
  timeoutMs: number,
  signal: AbortSignal,
) => Promise<SpawnResult>;

type FactoryConfig = {
  orchestrator: string;
  limits: A2aLimits;
  models: Record<string, string>;
  profiles: AgentProfile[];
};

const BUDGET_DEFAULT_MS = 30 * 60 * 1_000;
const BUDGET_MAX_MS = 2 * 60 * 60 * 1_000;

function intIn(value: unknown, fallback: number, min: number, max: number): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function parseFactoryConfig(
  inputs: AgentFactoryInputDto,
): { ok: true; config: FactoryConfig } | { ok: false; reason: string } {
  const orchestrator = (inputs.orchestrator || FACTORY_DEFAULT_ORCHESTRATOR).trim();
  if (!FACTORY_AGENT_SLUGS.includes(orchestrator)) {
    return { ok: false, reason: `orchestrator "${orchestrator}" cannot join an A2A team` };
  }
  const listed = parseJsonStringList(inputs.roster, 'roster');
  if (!listed.ok) return { ok: false, reason: listed.reason };
  const parsedProfiles = parseProfiles(inputs.profiles);
  if (!parsedProfiles.ok) return { ok: false, reason: parsedProfiles.reason };
  const profiles = parsedProfiles.profiles;
  const slugs =
    listed.items.length > 0 || profiles.length > 0 ? [...new Set(listed.items)] : [orchestrator];
  const unfit = [...slugs, ...profiles.map((p) => p.agent)].filter(
    (slug) => !FACTORY_AGENT_SLUGS.includes(slug),
  );
  if (unfit.length > 0) {
    return {
      ok: false,
      reason: `agents that cannot join an A2A team: ${[...new Set(unfit)].join(', ')}; allowed: ${FACTORY_AGENT_SLUGS.join(', ')}`,
    };
  }
  const roster: A2aMember[] = [
    ...profiles.map((p) => ({ name: p.name, agent: p.agent, description: p.description })),
    ...slugs.map((slug) => ({ name: slug, agent: slug, description: '' })),
  ];
  const names = roster.map((m) => m.name);
  const clash = names.find((n, i) => names.indexOf(n) !== i || n === ORCHESTRATOR_ROLE);
  if (clash) {
    return { ok: false, reason: `role name "${clash}" is used twice or reserved` };
  }
  let models: Record<string, string> = {};
  const rawModels: unknown = inputs.models;
  if (rawModels && (typeof rawModels !== 'string' || rawModels.trim())) {
    try {
      const parsed: unknown = typeof rawModels === 'string' ? JSON.parse(rawModels) : rawModels;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      models = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '',
        ),
      );
    } catch {
      return { ok: false, reason: 'models must be a JSON object slug → model' };
    }
  }
  return {
    ok: true,
    config: {
      orchestrator,
      models,
      profiles,
      limits: {
        roster,
        maxAgents: intIn(inputs.maxAgents, 6, 1, 32),
        maxDepth: intIn(inputs.maxDepth, 2, 0, 5),
        budgetMs: intIn(inputs.budgetMs, BUDGET_DEFAULT_MS, 10_000, BUDGET_MAX_MS),
        agentTimeoutMs: clampTimeout(inputs.agentTimeoutMs),
        waitSliceMs: intIn(inputs.waitSliceMs, 45_000, 5_000, 110_000),
      },
    },
  };
}

function unsupported(reason: string): AgentFactoryOutputDto {
  return {
    text: reason,
    status: 'unsupported',
    meta: JSON.stringify({ version: 1, error: reason }),
  };
}

export async function runAgentFactory(
  inputs: AgentFactoryInputDto,
  hub: A2aHub,
  runner: FactoryRunner = runContainer,
): Promise<AgentFactoryOutputDto> {
  const task = (inputs.task ?? '').trim();
  if (!task) return unsupported('task is empty');
  const parsed = parseFactoryConfig(inputs);
  if (!parsed.ok) return unsupported(parsed.reason);
  const { orchestrator, limits, models, profiles } = parsed.config;
  const byRole = new Map(profiles.map((p) => [p.name, p]));

  const launcher: A2aLauncher = (launch) => {
    const adapter = getAdapter(launch.slug)!;
    const profile = byRole.get(launch.role);
    const own = profile ?? inputs;
    const attach = withA2aServer(
      parseMcpAttach(own.mcpAttach),
      a2aMcpServer(hub.url, launch.token, launch.tools),
      launch.tools,
    );
    const model = isProprietaryAgentSlug(launch.slug)
      ? profile?.model ?? models[launch.slug] ?? PROPRIETARY_DEFAULT_MODEL[launch.slug]
      : undefined;
    return executeCliAgent(
      adapter,
      {
        task: launch.prompt,
        llmConfig: profile?.llmConfig ?? inputs.llmConfig,
        skillAttach: own.skillAttach,
        rulesAttach: own.rulesAttach,
        mcpAttach: JSON.stringify(attach),
        apiKey: inputs.apiKey,
        timeoutMs: launch.timeoutMs,
        ...(model ? { model } : {}),
      },
      (spec, timeoutMs) =>
        runner(
          { ...spec, extraHosts: [...(spec.extraHosts ?? []), ...hub.extraHosts] },
          timeoutMs,
          launch.signal,
        ),
    );
  };

  const session = new A2aSession(limits, launcher);
  const unregister = hub.register(session);
  try {
    const result = await session.run(orchestrator, task);
    return {
      text: result.text,
      status: result.status,
      meta: JSON.stringify(result.meta),
    };
  } finally {
    unregister();
  }
}
