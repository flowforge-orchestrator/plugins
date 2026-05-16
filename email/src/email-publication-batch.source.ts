import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getEmailExecutors } from './executors.index';

@Injectable()
export class EmailPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(EmailPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('EmailPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    this.logger.log(
      `[registration] executor batch pull ← plugin-manager:\n${JSON.stringify(request)}`,
    );

    const response = buildExecutorBatchPullResponseFromEntries({
      entries: getEmailExecutors(),
      request,
      defaults: { pluginId: 'email', pluginLabel: 'Email' },
    });

    this.logger.log(
      `[registration] executor batch pull → plugin-manager (items[].transport — то, что уходит в теле ответа):\n${JSON.stringify(response)}`,
    );

    return response;
  }
}
