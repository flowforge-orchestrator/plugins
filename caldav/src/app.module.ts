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
import { CaldavManifestBuilder } from './caldav-manifest.builder';
import { CaldavPublicationBatchSource } from './caldav-batch.source';
import { getCaldavExecutors } from './caldav/executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(CaldavPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: CaldavManifestBuilder,
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
        pluginId: 'caldav',
        pluginLabel: 'CalDAV',
        pluginDescription:
          'Универсальная интеграция CalDAV: список календарей, события за период, CRUD по eventUrl.',
        pluginVariables: [],
        getExecutors: () => getCaldavExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.caldav.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
