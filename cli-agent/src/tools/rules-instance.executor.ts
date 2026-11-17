import { join } from 'node:path';
import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import {
  RulesInstanceInputDto,
  RulesInstanceOutputDto,
} from './rules-instance.io';
import type { SkillInstancePayload } from './skill-instance.types';

@Executor<RulesInstanceInputDto, RulesInstanceOutputDto>({
  nodeType: 'plugin.cli-agent.rules-instance',
  name: 'CLI rules instance',
  description:
    'Имя + тело правил (AGENTS.md) → instance для RulesProvider.',
  help: loadHelpFromFile(join(__dirname, 'rules-instance')),
  tags: ['cli-agent', 'rules'],
  pluginId: 'cli-agent',
  inputs: RulesInstanceInputDto,
  outputs: RulesInstanceOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class RulesInstanceExecutor {
  execute(
    ctx: ExecContext<RulesInstanceInputDto>,
  ): Promise<RulesInstanceOutputDto> {
    try {
      const name = (ctx.inputs.name ?? 'AGENTS.md')
        .trim()
        .replace(/^\/+/, '')
        .split('/')
        .pop();
      if (!name) throw new Error('name is empty');
      const body = ctx.inputs.body;
      if (!body.trim()) throw new Error('body is empty');
      const payload: SkillInstancePayload = { version: 1, name, body };
      return Promise.resolve({
        instance: JSON.stringify(payload),
        status: 'ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Promise.resolve({ instance: '', status: `error: ${message}` });
    }
  }
}
