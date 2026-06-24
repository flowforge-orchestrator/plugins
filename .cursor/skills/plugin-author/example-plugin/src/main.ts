import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { bootstrapPluginExecutorMicroservice } from '@kosolapus/plugin-ts-sdk';
import { AppModule } from './app.module';

const logger = new Logger('PluginExample');

void (async () => {
  await bootstrapPluginExecutorMicroservice(AppModule);
})().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
