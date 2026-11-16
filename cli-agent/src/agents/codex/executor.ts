import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  CliAgentOutputDto,
  CodexInputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { codexAdapter } from './adapter';

@Executor<CodexInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.codex',
  name: 'CLI agent: Codex',
  description: codexAdapter.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: CodexInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CodexCliAgentExecutor {
  execute(ctx: ExecContext<CodexInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(codexAdapter, ctx.inputs);
  }
}
