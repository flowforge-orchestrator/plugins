import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { runAgentFactory } from './factory';
import { AgentFactoryInputDto, AgentFactoryOutputDto } from './factory.io';
import { sharedA2aHub } from './hub';

@Executor<AgentFactoryInputDto, AgentFactoryOutputDto>({
  nodeType: 'plugin.cli-agent.factory',
  name: 'CLI agent factory (A2A)',
  description:
    'Оркестратор запускает команду CLI-агентов, они делегируют и переписываются через A2A; наружу — ответ и meta.',
  tags: ['cli-agent', 'a2a'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: AgentFactoryInputDto,
  outputs: AgentFactoryOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class AgentFactoryExecutor {
  async execute(
    ctx: ExecContext<AgentFactoryInputDto>,
  ): Promise<AgentFactoryOutputDto> {
    let hub;
    try {
      hub = await sharedA2aHub();
    } catch (error) {
      const reason = `a2a hub failed to start: ${error instanceof Error ? error.message : String(error)}`;
      return { text: reason, status: 'error', meta: JSON.stringify({ version: 1, error: reason }) };
    }
    return runAgentFactory(ctx.inputs, hub);
  }
}
