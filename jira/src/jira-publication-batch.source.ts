import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getJiraExecutors } from './jira/executors.index';

@Injectable()
export class JiraPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(JiraPublicationBatchSource.name);

  onModuleInit() {
    this.logger.log('JiraPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    this.logger.log(
      `[registration] executor batch pull ← plugin-manager:\n${JSON.stringify(request)}`,
    );

    const response = buildExecutorBatchPullResponseFromEntries({
      entries: getJiraExecutors(),
      request,
      defaults: { pluginId: 'jira', pluginLabel: 'Jira' },
    });

    this.logger.log(
      `[registration] executor batch pull → plugin-manager (items[].transport — то, что уходит в теле ответа):\n${JSON.stringify(response)}`,
    );

    return response;
  }
}
