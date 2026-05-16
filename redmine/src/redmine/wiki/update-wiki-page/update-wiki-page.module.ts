import { DynamicModule } from '@nestjs/common';
import {
  ExecutorBusManagerModule,
  ExecutorBusManagerService,
} from '@app/executor-bus-manager';
import { REGISTRY, TRANSPORT_ADAPTER } from '@app/executor';
import { RedmineUpdateWikiPageExecutor } from './update-wiki-page.executor';

export const RedmineUpdateWikiPageModule = (
  RedmineUpdateWikiPageExecutor as unknown as {
    createModule: (m: Partial<DynamicModule>) => DynamicModule;
  }
).createModule({
  imports: [ExecutorBusManagerModule],
  providers: [
    { provide: TRANSPORT_ADAPTER, useClass: ExecutorBusManagerService },
    { provide: REGISTRY, useClass: ExecutorBusManagerService },
  ],
});
