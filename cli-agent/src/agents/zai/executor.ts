import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  CliAgentInputDto,
  CliAgentOutputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { zaiAdapter } from './adapter';

@Executor<CliAgentInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.zai',
  name: 'CLI agent: Z.ai',
  description: zaiAdapter.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: CliAgentInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ZaiCliAgentExecutor {
  execute(ctx: ExecContext<CliAgentInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(zaiAdapter, ctx.inputs);
  }
}
