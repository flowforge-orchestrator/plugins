import { Module } from '@nestjs/common';
import {
  BULK_EXECUTOR_ROUTER_OPTIONS,
  BulkExecutorRouterService,
  BulkExecutorTaskHandler,
  buildExecutorStepAckNotifierFromEnv,
  DefaultRegistry,
  DefaultTransportAdapter,
  ExecutorTaskTcpController,
  OUTPUT_ROUTER,
  PluginPublicationTcpHostModule,
  REGISTRY,
  TcpControlPlaneOutputRouter,
  TRANSPORT_ADAPTER,
} from '@kosolapus/plugin-ts-sdk';
import { LlmPluginManifestBuilder } from './llm-manifest.builder';
import { LlmPublicationBatchSource } from './llm-publication-batch.source';
import { getLlmExecutors } from './executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(LlmPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: LlmPluginManifestBuilder,
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
        pluginId: 'llm',
        pluginLabel: 'LLM',
        pluginVariables: [],
        getExecutors: () => getLlmExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
