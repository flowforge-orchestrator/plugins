import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  CliAgentInputDto,
  CliAgentOutputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { aiderAdapter } from './adapter';

@Executor<CliAgentInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.aider',
  name: 'CLI agent: Aider',
  description: aiderAdapter.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: CliAgentInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class AiderCliAgentExecutor {
  execute(ctx: ExecContext<CliAgentInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(aiderAdapter, ctx.inputs);
  }
}
