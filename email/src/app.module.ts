import { Module } from '@nestjs/common';
import {
  BULK_EXECUTOR_ROUTER_OPTIONS,
  BulkExecutorRouterService,
  BulkExecutorTaskHandler,
  buildExecutorStepAckNotifierFromEnv,
  DefaultRegistry,
  DefaultTransportAdapter,
  type ExecutorClass,
  executorsFromClasses,
  ExecutorTaskTcpController,
  OUTPUT_ROUTER,
  PluginPublicationTcpHostModule,
  REGISTRY,
  TcpControlPlaneOutputRouter,
  TRANSPORT_ADAPTER,
} from '@kosolapus/plugin-ts-sdk';
import { DataEmailSendExecutor } from './send/executor';
import { EmailPublicationBatchSource } from './email-publication-batch.source';
import { EmailPluginManifestBuilder } from './email-manifest.builder';

@Module({
  imports: [
    PluginPublicationTcpHostModule.forRoot(EmailPublicationBatchSource, {
      manifestOnInit: true,
      manifestBuilder: EmailPluginManifestBuilder,
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
        pluginId: 'email',
        pluginLabel: 'Email',
        pluginDescription:
          'SMTP email plugin (TCP publication + executor, CP step-ack/step-result по TCP ingress).',
        pluginVariables: [],
        getExecutors: () =>
          executorsFromClasses([
            DataEmailSendExecutor as unknown as ExecutorClass,
          ]),
        notifyStepStarted: buildExecutorStepAckNotifierFromEnv(),
        nodeTypePrefix: 'data.email.',
      },
    },
    BulkExecutorTaskHandler,
    BulkExecutorRouterService,
  ],
})
export class AppModule {}
