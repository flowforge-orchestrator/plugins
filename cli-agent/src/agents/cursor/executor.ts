import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import {
  CliAgentOutputDto,
  CursorInputDto,
} from '../../contract/cli-agent.io';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCliAgent } from '../execute';
import { cursorAdapter } from './adapter';

@Executor<CursorInputDto, CliAgentOutputDto>({
  nodeType: 'plugin.cli-agent.cursor',
  name: 'CLI agent: Cursor',
  description: cursorAdapter.description,
  tags: ['cli-agent'],
  help: loadHelpFromFile(__dirname),
  pluginId: 'cli-agent',
  inputs: CursorInputDto,
  outputs: CliAgentOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CursorCliAgentExecutor {
  execute(ctx: ExecContext<CursorInputDto>): Promise<CliAgentOutputDto> {
    return executeCliAgent(cursorAdapter, ctx.inputs);
  }
}
