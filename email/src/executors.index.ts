import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { DataEmailSendExecutor } from './send/executor';

const EMAIL_EXECUTOR_CLASSES = [DataEmailSendExecutor] as const;

export function getEmailExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EMAIL_EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
