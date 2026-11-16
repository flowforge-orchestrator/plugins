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
import { ExecutionManifestBuilder } from './execution-manifest.builder';
import { ExecutionPublicationBatchSource } from './execution-batch.source';
import { getExecutionExecutors } from './execution/executors.index';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(ExecutionPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: ExecutionManifestBuilder,
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
        pluginId: 'execution',
        pluginLabel: 'Execution',
        pluginDescription:
          'Код в песочнице, edge-функция и одноразовый контейнер без сети.',
        pluginVariables: [],
        getExecutors: () => getExecutionExecutors(),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'plugin.execution.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
