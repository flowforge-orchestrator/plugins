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
import { getCliAgentExecutors } from './agents/executors.index';
import { CliAgentPublicationBatchSource } from './cli-agent-batch.source';
import { CliAgentManifestBuilder } from './cli-agent-manifest.builder';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(CliAgentPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: CliAgentManifestBuilder,
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
        pluginId: 'cli-agent',
        pluginLabel: 'CLI agents',
        pluginDescription:
          'Взаимозаменяемые CLI coding agents в одноразовых Docker-контейнерах.',
        pluginVariables: [],
        getExecutors: () => getCliAgentExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.cli-agent.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
