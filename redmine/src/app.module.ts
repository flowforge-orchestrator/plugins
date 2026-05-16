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
import { RedminePluginManifestBuilder } from './redmine-manifest.builder';
import { RedminePublicationBatchSource } from './redmine-batch.source';
import { getRedmineExecutors } from './redmine/executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(RedminePublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: RedminePluginManifestBuilder,
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
        pluginId: 'redmine',
        pluginLabel: 'Redmine',
        pluginVariables: [],
        getExecutors: () => getRedmineExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.redmine.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
