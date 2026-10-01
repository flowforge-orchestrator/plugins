import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getRagExecutors } from './executors.index';

@Injectable()
export class RagPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(RagPublicationBatchSource.name);

  onModuleInit(): void {
    this.logger.log('RagPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    return buildExecutorBatchPullResponseFromEntries({
      entries: getRagExecutors(),
      request,
      defaults: { pluginId: 'rag', pluginLabel: 'RAG' },
    });
  }
}
