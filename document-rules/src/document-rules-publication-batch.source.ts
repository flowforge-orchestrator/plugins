import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  PluginExecutorBatchSource,
  PluginExecutorPullBatchRequest,
  PluginExecutorPullBatchResponse,
} from '@kosolapus/plugin-ts-sdk';
import { buildExecutorBatchPullResponseFromEntries } from '@kosolapus/plugin-ts-sdk';
import { getDocumentRulesExecutors } from './executors.index';

@Injectable()
export class DocumentRulesPublicationBatchSource
  implements PluginExecutorBatchSource, OnModuleInit
{
  private readonly logger = new Logger(DocumentRulesPublicationBatchSource.name);

  onModuleInit(): void {
    this.logger.log('DocumentRulesPublicationBatchSource initialized');
  }

  async buildBatch(
    request: PluginExecutorPullBatchRequest,
  ): Promise<PluginExecutorPullBatchResponse> {
    return buildExecutorBatchPullResponseFromEntries({
      entries: getDocumentRulesExecutors(),
      request,
      defaults: {
        pluginId: 'document-rules',
        pluginLabel: 'Обработка документа',
      },
    });
  }
}
