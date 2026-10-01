import { Module } from '@nestjs/common';
import { join } from 'path';
import {
  BULK_EXECUTOR_ROUTER_OPTIONS,
  BulkExecutorRouterService,
  BulkExecutorTaskHandler,
  buildExecutorStepAckNotifierFromEnv,
  DefaultRegistry,
  DefaultTransportAdapter,
  ExecutorTaskTcpController,
  OUTPUT_ROUTER,
  PluginAssetHttpModule,
  PluginPublicationTcpHostModule,
  REGISTRY,
  TcpControlPlaneOutputRouter,
  TRANSPORT_ADAPTER,
} from '@kosolapus/plugin-ts-sdk';
import { RagPluginManifestBuilder } from './rag-manifest.builder';
import { RagPublicationBatchSource } from './rag-batch.source';
import { ragPluginAssetEntries } from './rag-ui-manifest';
import { getRagExecutors } from './executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(RagPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: RagPluginManifestBuilder,
    }),
    PluginAssetHttpModule.forRoot({
      assetsDir: join(__dirname, 'ui'),
      assets: ragPluginAssetEntries(),
    }),
  ],
  controllers: [ExecutorTaskTcpController],
  providers: [
    TcpControlPlaneOutputRouter,
    { provide: OUTPUT_ROUTER, useExisting: TcpControlPlaneOutputRouter },
    { provide: TRANSPORT_ADAPTER, useClass: DefaultTransportAdapter },
    { provide: REGISTRY, useClass: DefaultRegistry },
    {
      provide: BULK_EXECUTOR_ROUTER_OPTIONS,
      useValue: {
        pluginId: 'rag',
        pluginLabel: 'RAG по документам',
        pluginDescription:
          'Индексация, поиск и агентный диалог по документам (вектор + граф внутри плагина).',
        pluginVariables: [
          {
            key: 'embeddingModel',
            label: 'Модель эмбеддингов',
            description: 'См. EMBEDDING_MODEL в env sidecar',
          },
          {
            key: 'llmModel',
            label: 'Модель LLM',
            description: 'См. LLM_MODEL в env sidecar',
          },
        ],
        getExecutors: () => getRagExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.rag.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
