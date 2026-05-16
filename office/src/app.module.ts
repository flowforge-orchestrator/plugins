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
import { OfficePluginManifestBuilder } from './office-manifest.builder';
import { OfficePublicationBatchSource } from './office-publication-batch.source';
import { getOfficeExecutors } from './executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(OfficePublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: OfficePluginManifestBuilder,
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
        pluginId: 'office',
        pluginLabel: 'Офис',
        pluginVariables: [],
        getExecutors: () => getOfficeExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'system.office.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
