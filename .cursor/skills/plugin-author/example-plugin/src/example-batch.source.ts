import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getExampleExecutors } from './executors.index';

@Injectable()
export class ExamplePublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(ExamplePublicationBatchSource.name);

  onModuleInit(): void {
    this.logger.log('ExamplePublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    return buildExecutorBatchPullResponseFromEntries({
      entries: getExampleExecutors(),
      request,
      defaults: { pluginId: 'example', pluginLabel: 'Example' },
    });
  }
}
