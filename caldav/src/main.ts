import './load-env';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { bootstrapPluginExecutorMicroservice } from '@kosolapus/plugin-ts-sdk';

const logger = new Logger('PluginCaldav');

void (async () => {
  await bootstrapPluginExecutorMicroservice(AppModule);
})().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
