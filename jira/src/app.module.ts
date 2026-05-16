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
import { JiraPluginManifestBuilder } from './jira-manifest.builder';
import { JiraPublicationBatchSource } from './jira-publication-batch.source';
import { getJiraExecutors } from './jira/executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(JiraPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: JiraPluginManifestBuilder,
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
        pluginId: 'jira',
        pluginLabel: 'Jira',
        pluginVariables: [],
        getExecutors: () => getJiraExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.jira.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
