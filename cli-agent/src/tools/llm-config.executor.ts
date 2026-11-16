import { join } from 'node:path';
import {
  ExecContext,
  Executor,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { LlmConfigInputDto, LlmConfigOutputDto } from './llm-config.io';
import type { LlmConfig } from './llm-config.types';

@Executor<LlmConfigInputDto, LlmConfigOutputDto>({
  nodeType: 'plugin.cli-agent.llm-config',
  name: 'CLI LLM config',
  description:
    'Общий LLM-конфиг (provider / model / baseUrl / apiKey) → opaque llmConfig для всех CLI-агентов.',
  help: loadHelpFromFile(join(__dirname, 'llm-config')),
  tags: ['cli-agent', 'llm', 'config'],
  pluginId: 'cli-agent',
  inputs: LlmConfigInputDto,
  outputs: LlmConfigOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class LlmConfigExecutor {
  execute(ctx: ExecContext<LlmConfigInputDto>): Promise<LlmConfigOutputDto> {
    try {
      const provider = ctx.inputs.provider.trim();
      if (!provider) throw new Error('provider is empty');
      const apiKey = ctx.inputs.apiKey;
      if (!apiKey?.trim()) throw new Error('apiKey is empty');
      const payload: LlmConfig = {
        version: 1,
        provider,
        model: (ctx.inputs.model ?? '').trim(),
        baseUrl: (ctx.inputs.baseUrl ?? '').trim(),
        apiKey,
      };
      return Promise.resolve({
        llmConfig: JSON.stringify(payload),
        status: 'ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Promise.resolve({
        llmConfig: '',
        status: `error: ${message}`,
      });
    }
  }
}
