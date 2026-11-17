import { join } from 'node:path';
import {
  ExecContext,
  Executor,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { LlmConfigOutputDto } from './llm-config.io';
import type { LlmConfig } from './llm-config.types';
import { GigachatConfigInputDto } from './gigachat-config.io';
import {
  exchangeGigachatAccessToken,
  GIGACHAT_DEFAULT_MODEL,
  GIGACHAT_DEFAULT_SCOPE,
  resolveGigachatOpenAiBaseUrl,
  type FetchLike,
} from './gigachat-oauth';

@Executor<GigachatConfigInputDto, LlmConfigOutputDto>({
  nodeType: 'plugin.cli-agent.llm-config.gigachat',
  name: 'CLI LLM config (GigaChat)',
  description:
    'Authorization key GigaChat → opaque llmConfig (OAuth + api.giga.chat).',
  help: loadHelpFromFile(join(__dirname, 'gigachat-config')),
  tags: ['cli-agent', 'llm', 'config', 'gigachat'],
  pluginId: 'cli-agent',
  inputs: GigachatConfigInputDto,
  outputs: LlmConfigOutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class GigachatConfigExecutor {
  /** Unit tests only — production uses gigachatHttpsFetch (Russian CA). */
  fetchImpl?: FetchLike;

  async execute(
    ctx: ExecContext<GigachatConfigInputDto>,
  ): Promise<LlmConfigOutputDto> {
    try {
      const apiKey = ctx.inputs.apiKey;
      if (!apiKey?.trim()) throw new Error('apiKey is empty');
      const scope =
        (ctx.inputs.scope ?? '').trim() || GIGACHAT_DEFAULT_SCOPE;
      const model =
        (ctx.inputs.model ?? '').trim() || GIGACHAT_DEFAULT_MODEL;

      const token = await exchangeGigachatAccessToken({
        credentials: apiKey,
        scope,
        fetchImpl: this.fetchImpl,
      });
      if (!token.ok) {
        throw new Error(token.reason);
      }

      const payload: LlmConfig = {
        version: 1,
        provider: 'custom',
        model,
        baseUrl: resolveGigachatOpenAiBaseUrl(scope),
        apiKey: token.accessToken,
      };
      return {
        llmConfig: JSON.stringify(payload),
        status: 'ok',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmConfig: '',
        status: `error: ${message}`,
      };
    }
  }
}
