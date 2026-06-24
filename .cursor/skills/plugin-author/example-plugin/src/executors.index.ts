import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { ExampleEchoExecutor } from './patterns/executor-echo/echo.executor';

const EXECUTOR_CLASSES = [ExampleEchoExecutor] as const;

export function getExampleExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
