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
import { TelegramPluginManifestBuilder } from './telegram-manifest.builder';
import { TelegramPublicationBatchSource } from './telegram-batch.source';
import { getTelegramExecutors } from './telegram/executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(TelegramPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: TelegramPluginManifestBuilder,
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
        pluginId: 'telegram',
        pluginLabel: 'Telegram',
        pluginVariables: [],
        getExecutors: () => getTelegramExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.telegram.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
