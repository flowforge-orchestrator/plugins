import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getCliAgentExecutors } from './agents/executors.index';

@Injectable()
export class CliAgentPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(CliAgentPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('CliAgentPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    return buildExecutorBatchPullResponseFromEntries({
      entries: getCliAgentExecutors(),
      request,
      defaults: {
        pluginId: 'cli-agent',
        pluginLabel: 'CLI agents',
      },
    });
  }
}
