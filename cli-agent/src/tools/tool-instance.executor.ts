import { join } from 'node:path';
import { ExecContext, Executor, loadHelpFromFile } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import {
  ToolInstanceInputDto,
  ToolInstanceOutputDto,
} from './tool-instance.io';
import { parseToolMeta, type ToolInstancePayload } from './tool-instance.types';

@Executor<ToolInstanceInputDto, ToolInstanceOutputDto>({
  nodeType: 'plugin.cli-agent.tool-instance',
  name: 'CLI tool instance',
  description:
    'Связывает meta-описание тула и исходник исполнения в один instance для ToolProvider.',
  help: loadHelpFromFile(join(__dirname, 'tool-instance')),
  tags: ['cli-agent', 'tools', 'mcp'],
  pluginId: 'cli-agent',
  inputs: ToolInstanceInputDto,
  outputs: ToolInstanceOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ToolInstanceExecutor {
  execute(
    ctx: ExecContext<ToolInstanceInputDto>,
  ): Promise<ToolInstanceOutputDto> {
    try {
      const meta = parseToolMeta(ctx.inputs.meta);
      if (!meta) {
        throw new Error(
          'meta must be { name, description, inputSchema } (object or JSON)',
        );
      }
      const language = (ctx.inputs.language ?? 'javascript').trim().toLowerCase();
      if (language !== 'javascript') {
        throw new Error('language must be javascript');
      }
      const source = ctx.inputs.source.trim();
      if (!source) {
        throw new Error('source is empty');
      }
      const payload: ToolInstancePayload = {
        version: 1,
        meta,
        source,
        language: 'javascript',
      };
      return Promise.resolve({
        instance: JSON.stringify(payload),
        status: 'ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Promise.resolve({
        instance: '',
        status: `error: ${message}`,
      });
    }
  }
}
