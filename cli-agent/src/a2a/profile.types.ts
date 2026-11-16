/**
 * A team role: CLI agent + its own attaches. Produced by agent-profile nodes
 * (chained through the `profiles` port), consumed by the factory roster.
 */
export type AgentProfile = {
  version: 1;
  name: string;
  agent: string;
  description: string;
  model?: string;
  llmConfig?: string;
  mcpAttach?: string;
  skillAttach?: string;
  rulesAttach?: string;
};

export const PROFILE_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

const OPAQUE_KEYS = ['model', 'llmConfig', 'mcpAttach', 'skillAttach', 'rulesAttach'] as const;

function opaque(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.trim() ? text : undefined;
}

export function parseProfiles(
  raw: unknown,
): { ok: true; profiles: AgentProfile[] } | { ok: false; reason: string } {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    return { ok: true, profiles: [] };
  }
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'profiles must be a JSON array of agent profiles' };
    }
  }
  if (!Array.isArray(value)) {
    return { ok: false, reason: 'profiles must be a JSON array of agent profiles' };
  }
  const profiles: AgentProfile[] = [];
  const names = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return { ok: false, reason: 'profile must be an object' };
    }
    const p = item as Record<string, unknown>;
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const agent = typeof p.agent === 'string' ? p.agent.trim() : '';
    if (p.version !== 1 || !PROFILE_NAME.test(name) || !agent) {
      return { ok: false, reason: `invalid profile ${JSON.stringify(name || p.name)}` };
    }
    if (names.has(name)) {
      return { ok: false, reason: `duplicate profile name: ${name}` };
    }
    names.add(name);
    const profile: AgentProfile = {
      version: 1,
      name,
      agent,
      description: typeof p.description === 'string' ? p.description.trim() : '',
    };
    for (const key of OPAQUE_KEYS) {
      const v = opaque(p[key]);
      if (v) profile[key] = v;
    }
    profiles.push(profile);
  }
  return { ok: true, profiles };
}
