import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  CliAgentInputDto,
  CliAgentOutputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { openclawAdapter } from './adapter';

@Executor<CliAgentInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.openclaw',
  name: 'CLI agent: OpenClaw',
  description: openclawAdapter.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: CliAgentInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class OpenclawCliAgentExecutor {
  execute(ctx: ExecContext<CliAgentInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(openclawAdapter, ctx.inputs);
  }
}
