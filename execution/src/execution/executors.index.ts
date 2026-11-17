import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { ExecutionCodeExecutor } from './code/executor';
import { ExecutionContainerExecutor } from './container/executor';
import { ExecutionEdgeExecutor } from './edge/executor';

const EXECUTOR_CLASSES = [
  ExecutionCodeExecutor,
  ExecutionEdgeExecutor,
  ExecutionContainerExecutor,
] as const;

export function getExecutionExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
