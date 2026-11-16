import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getExecutionExecutors } from './execution/executors.index';

@Injectable()
export class ExecutionPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(ExecutionPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('ExecutionPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    return buildExecutorBatchPullResponseFromEntries({
      entries: getExecutionExecutors(),
      request,
      defaults: {
        pluginId: 'execution',
        pluginLabel: 'Execution',
      },
    });
  }
}
