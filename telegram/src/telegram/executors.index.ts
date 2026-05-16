import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { TelegramSendExecutor } from './send/send.executor';

const EXECUTOR_CLASSES = [TelegramSendExecutor] as const;

export function getTelegramExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
