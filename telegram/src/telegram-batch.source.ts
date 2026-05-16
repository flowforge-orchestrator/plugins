import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getTelegramExecutors } from './telegram/executors.index';

@Injectable()
export class TelegramPublicationBatchSource implements PluginExecutorBatchSource, OnModuleInit {

  private readonly logger = new Logger(TelegramPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('TelegramPublicationBatchSource initialized');
  }
  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    this.logger.log(
      `[registration] executor batch pull ← plugin-manager:\n${JSON.stringify(request)}`,
    );

    const response = buildExecutorBatchPullResponseFromEntries({
      entries: getTelegramExecutors(),
      request,
      defaults: { pluginId: 'telegram', pluginLabel: 'Telegram' },
    });

    this.logger.log(
      `[registration] executor batch pull → plugin-manager (items[].transport — то, что уходит в теле ответа):\n${JSON.stringify(response)}`,
    );

    return response;
  }
}
