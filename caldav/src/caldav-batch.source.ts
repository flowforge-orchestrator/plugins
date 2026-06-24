import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getCaldavExecutors } from './caldav/executors.index';

@Injectable()
export class CaldavPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(CaldavPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('CaldavPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    return buildExecutorBatchPullResponseFromEntries({
      entries: getCaldavExecutors(),
      request,
      defaults: {
        pluginId: 'caldav',
        pluginLabel: 'CalDAV',
      },
    });
  }
}
