import { join } from 'node:path';
import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import {
  SkillInstanceInputDto,
  SkillInstanceOutputDto,
} from './skill-instance.io';
import type { SkillInstancePayload } from './skill-instance.types';

@Executor<SkillInstanceInputDto, SkillInstanceOutputDto>({
  nodeType: 'plugin.cli-agent.skill-instance',
  name: 'CLI skill instance',
  description:
    'Имя + тело SKILL.md → instance для SkillProvider (контент снаружи плагина).',
  help: loadHelpFromFile(join(__dirname, 'skill-instance')),
  tags: ['cli-agent', 'skills'],
  pluginId: 'cli-agent',
  inputs: SkillInstanceInputDto,
  outputs: SkillInstanceOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class SkillInstanceExecutor {
  execute(
    ctx: ExecContext<SkillInstanceInputDto>,
  ): Promise<SkillInstanceOutputDto> {
    try {
      const name = ctx.inputs.name.trim().replace(/^\/+/, '').split('/').pop();
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
