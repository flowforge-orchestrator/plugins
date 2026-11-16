import { join } from 'node:path';
import {
  ExecContext,
  Executor,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import type { RulesAttach } from './skill-attach';
import {
  RULES_PROVIDER_STATIC_KEYS,
  RulesProviderOutputDto,
} from './rules-provider.io';
import { parseSkillInstance } from './skill-instance.types';

function collectInstances(
  inputs: Record<string, unknown>,
): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const names = new Set<string>();
  for (const [key, raw] of Object.entries(inputs)) {
    if (RULES_PROVIDER_STATIC_KEYS.has(key)) continue;
    if (raw == null || String(raw).trim() === '') continue;
    const parsed = parseSkillInstance(raw);
    if (!parsed) {
      throw new Error(`invalid RulesInstance on port "${key}"`);
    }
    if (names.has(parsed.name)) {
      throw new Error(`duplicate rule name: ${parsed.name}`);
    }
    names.add(parsed.name);
    out.push({ name: parsed.name, body: parsed.body });
  }
  return out;
}

@Executor<Record<string, unknown>, RulesProviderOutputDto>({
  nodeType: 'plugin.cli-agent.rules-provider',
  name: 'CLI rules provider',
  description:
    'Динамические RulesInstance → opaque rulesAttach для CLI-агента.',
  help: loadHelpFromFile(join(__dirname, 'rules-provider')),
  tags: ['cli-agent', 'rules'],
  pluginId: 'cli-agent',
  inputs: null,
  outputs: RulesProviderOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class RulesProviderExecutor {
  execute(
    ctx: ExecContext<Record<string, unknown>>,
  ): Promise<RulesProviderOutputDto> {
    try {
      const rules = collectInstances(
        (ctx.inputs ?? {}) as Record<string, unknown>,
      );
      if (rules.length === 0) {
        throw new Error(
          'add at least one dynamic input port with a RulesInstance',
        );
      }
      const attach: RulesAttach = { version: 1, rules };
      return Promise.resolve({
        rulesAttach: JSON.stringify(attach),
        ruleNames: JSON.stringify(rules.map((r) => r.name)),
        status: 'ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Promise.resolve({
        rulesAttach: '',
        ruleNames: '[]',
        status: `error: ${message}`,
      });
    }
  }
}
