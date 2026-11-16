import { join } from 'node:path';
import {
  ExecContext,
  Executor,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import type { SkillAttach } from './skill-attach';
import {
  SKILL_PROVIDER_STATIC_KEYS,
  SkillProviderOutputDto,
} from './skill-provider.io';
import { parseSkillInstance } from './skill-instance.types';

function collectInstances(
  inputs: Record<string, unknown>,
): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const names = new Set<string>();
  for (const [key, raw] of Object.entries(inputs)) {
    if (SKILL_PROVIDER_STATIC_KEYS.has(key)) continue;
    if (raw == null || String(raw).trim() === '') continue;
    const parsed = parseSkillInstance(raw);
    if (!parsed) {
      throw new Error(`invalid SkillInstance on port "${key}"`);
    }
    if (names.has(parsed.name)) {
      throw new Error(`duplicate skill name: ${parsed.name}`);
    }
    names.add(parsed.name);
    out.push({ name: parsed.name, body: parsed.body });
  }
  return out;
}

@Executor<Record<string, unknown>, SkillProviderOutputDto>({
  nodeType: 'plugin.cli-agent.skill-provider',
  name: 'CLI skill provider',
  description:
    'Динамические SkillInstance → opaque skillAttach для CLI-агента.',
  help: loadHelpFromFile(join(__dirname, 'skill-provider')),
  tags: ['cli-agent', 'skills'],
  pluginId: 'cli-agent',
  inputs: null,
  outputs: SkillProviderOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class SkillProviderExecutor {
  execute(
    ctx: ExecContext<Record<string, unknown>>,
  ): Promise<SkillProviderOutputDto> {
    try {
      const skills = collectInstances((ctx.inputs ?? {}) as Record<string, unknown>);
      if (skills.length === 0) {
        throw new Error(
          'add at least one dynamic input port with a SkillInstance',
        );
      }
      const attach: SkillAttach = { version: 1, skills };
      return Promise.resolve({
        skillAttach: JSON.stringify(attach),
        skillNames: JSON.stringify(skills.map((s) => s.name)),
        status: 'ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Promise.resolve({
        skillAttach: '',
        skillNames: '[]',
        status: `error: ${message}`,
      });
    }
  }
}
