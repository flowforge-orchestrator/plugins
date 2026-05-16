import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getLlmExecutors } from './executors.index';

@Injectable()
export class LlmPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(LlmPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('LlmPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    this.logger.log(
      `[registration] executor batch pull ← plugin-manager:\n${JSON.stringify(request)}`,
    );

    const response = buildExecutorBatchPullResponseFromEntries({
      entries: getLlmExecutors(),
      request,
      defaults: { pluginId: 'llm', pluginLabel: 'LLM' },
    });

    this.logger.log(
      `[registration] executor batch pull → plugin-manager (items[].transport — то, что уходит в теле ответа):\n${JSON.stringify(response)}`,
    );

    return response;
  }
}
