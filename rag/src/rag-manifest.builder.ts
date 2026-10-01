import { Injectable, Logger } from '@nestjs/common';
import type {
  PluginManifestOnInitBuilder,
  PluginManifestRequestV2,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { getRagExecutors } from './executors.index';
import {
  RAG_PLAN_WIDGET_KEY,
  ragStaticAssets,
  ragUiForms,
} from './rag-ui-manifest';

@Injectable()
export class RagPluginManifestBuilder implements PluginManifestOnInitBuilder {
  private readonly logger = new Logger(RagPluginManifestBuilder.name);

  buildManifestRequest(): PluginManifestRequestV2 {
    const entries = getRagExecutors();
    const pull = publicationPullEndpointFromEnv();
    const request: PluginManifestRequestV2 = {
      kind: 'plugin_manifest_request_v2',
      pluginId: 'rag',
      publicationVersion:
        process.env.PLUGIN_PUBLICATION_VERSION?.trim() ?? '0.0.1',
      label: 'RAG по документам',
      description:
        'Индексация документов в векторный индекс и граф знаний, поиск и агентный диалог поверх корпуса.',
      variables: [
        {
          key: 'embeddingModel',
          label: 'Модель эмбеддингов',
          description:
            'Отображается в карточке плагина. В v1 исполнитель читает EMBEDDING_MODEL из env контейнера.',
        },
        {
          key: 'llmModel',
          label: 'Модель LLM',
          description:
            'Отображается в карточке плагина. В v1 исполнитель читает LLM_MODEL из env контейнера.',
        },
        {
          key: 'rerankModel',
          label: 'Модель реранка',
          description:
            'Ollama/chat model for plugin.rag.rerank (RERANK_MODEL). Default qwen3:0.6b.',
        },
        {
          key: 'agentModel',
          label: 'Модель агента',
          description:
            'Optional override label; agent.turn reads llmModel port or LLM_MODEL env.',
        },
      ],
      staticAssets: ragStaticAssets(),
      ui: ragUiForms(),
      executors: entries.map((e) => ({
        nodeType: e.nodeType,
        ...(e.nodeType === 'plugin.rag.agent.plan'
          ? { requiredTemplateKeys: [RAG_PLAN_WIDGET_KEY] }
          : {}),
      })),
      pull: { host: pull.host, port: pull.port },
    };
    this.logger.log(
      `[registration] manifest request:\n${JSON.stringify(request)}`,
    );
    return request;
  }
}
