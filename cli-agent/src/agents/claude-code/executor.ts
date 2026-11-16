import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  ClaudeCodeInputDto,
  CliAgentOutputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { claudeCodeAdapter } from './adapter';

@Executor<ClaudeCodeInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.claude-code',
  name: 'CLI agent: Claude Code',
  description: claudeCodeAdapter.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: ClaudeCodeInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ClaudeCodeCliAgentExecutor {
  execute(ctx: ExecContext<ClaudeCodeInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(claudeCodeAdapter, ctx.inputs);
  }
}
