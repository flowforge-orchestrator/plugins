import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getRedmineExecutors } from './redmine/executors.index';

@Injectable()
export class RedminePublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(RedminePublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('RedminePublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    this.logger.log(
      `[registration] executor batch pull ← plugin-manager:\n${JSON.stringify(request)}`,
    );

    const response = buildExecutorBatchPullResponseFromEntries({
      entries: getRedmineExecutors(),
      request,
      defaults: { pluginId: 'redmine', pluginLabel: 'Redmine' },
    });

    this.logger.log(
      `[registration] executor batch pull → plugin-manager (items[].transport — то, что уходит в теле ответа):\n${JSON.stringify(response)}`,
    );

    return response;
  }
}
