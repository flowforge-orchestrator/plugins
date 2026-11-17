import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { parseProfiles } from '../profile.types';
import { AgentProfileInputDto, AgentProfileOutputDto } from './profile.io';

export function appendProfile(inputs: AgentProfileInputDto): AgentProfileOutputDto {
  const previous = parseProfiles(inputs.profiles);
  if (!previous.ok) {
    return { profiles: inputs.profiles ?? '[]', status: `error: ${previous.reason}` };
  }
  const merged = parseProfiles([
    ...previous.profiles,
    {
      version: 1,
      name: inputs.name,
      agent: inputs.agent,
      description: inputs.description,
      model: inputs.model,
      llmConfig: inputs.llmConfig,
      mcpAttach: inputs.mcpAttach,
      skillAttach: inputs.skillAttach,
      rulesAttach: inputs.rulesAttach,
    },
  ]);
  if (!merged.ok) {
    return { profiles: JSON.stringify(previous.profiles), status: `error: ${merged.reason}` };
  }
  return { profiles: JSON.stringify(merged.profiles), status: 'ok' };
}

@Executor<AgentProfileInputDto, AgentProfileOutputDto>({
  nodeType: 'plugin.cli-agent.agent-profile',
  name: 'CLI agent profile (A2A)',
  description: 'Роль команды для фабрики: CLI-агент, описание и свои инструменты, скиллы, правила.',
  tags: ['cli-agent', 'a2a'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: AgentProfileInputDto,
  outputs: AgentProfileOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class AgentProfileExecutor {
  execute(ctx: ExecContext<AgentProfileInputDto>): Promise<AgentProfileOutputDto> {
    return Promise.resolve(appendProfile(ctx.inputs));
  }
}
