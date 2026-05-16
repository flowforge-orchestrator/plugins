import { DynamicModule } from '@nestjs/common';
import {
  ExecutorBusManagerModule,
  ExecutorBusManagerService,
} from '@app/executor-bus-manager';
import { REGISTRY, TRANSPORT_ADAPTER } from '@app/executor';
import { RedmineUpdateIssueExecutor } from './update-issue.executor';

export const RedmineUpdateIssueModule = (
  RedmineUpdateIssueExecutor as unknown as {
    createModule: (m: Partial<DynamicModule>) => DynamicModule;
  }
).createModule({
  imports: [ExecutorBusManagerModule],
  providers: [
    { provide: TRANSPORT_ADAPTER, useClass: ExecutorBusManagerService },
    { provide: REGISTRY, useClass: ExecutorBusManagerService },
  ],
});
