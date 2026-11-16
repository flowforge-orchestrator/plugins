import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { DocumentRulesExecutor } from './document-rules.executor';

const EXECUTOR_CLASSES = [DocumentRulesExecutor] as const;

export function getDocumentRulesExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
