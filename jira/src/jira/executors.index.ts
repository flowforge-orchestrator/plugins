import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { GetIssuesExecutor } from './issue/get-issue-list/get-issue-list.executor';

const EXECUTOR_CLASSES = [GetIssuesExecutor] as const;

export function getJiraExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
