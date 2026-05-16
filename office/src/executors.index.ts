import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { SystemOfficeCsvReadExecutor } from './csv-read/executor';
import { SystemOfficeCsvWriteExecutor } from './csv-write/executor';
import { SystemOfficeDocxExtractTextExecutor } from './docx-extract-text/executor';
import { SystemOfficeXlsxReadExecutor } from './xlsx-read/executor';
import { SystemOfficeXlsxWriteExecutor } from './xlsx-write/executor';

const OFFICE_EXECUTORS = [
  SystemOfficeXlsxReadExecutor,
  SystemOfficeXlsxWriteExecutor,
  SystemOfficeCsvReadExecutor,
  SystemOfficeCsvWriteExecutor,
  SystemOfficeDocxExtractTextExecutor,
] as const;

function officeSectionPath(nodeType: string): readonly string[] {
  if (nodeType.includes('.xlsx.')) {
    return ['xlsx'];
  }
  if (nodeType.includes('.csv.')) {
    return ['csv'];
  }
  if (nodeType.includes('.docx.')) {
    return ['docx'];
  }
  return ['office'];
}

export function getOfficeExecutors(): ExecutorEntry[] {
  const entries = executorsFromClasses(
    OFFICE_EXECUTORS as unknown as readonly ExecutorClass[],
  );
  return entries.map((entry) => ({
    ...entry,
    opts: {
      ...entry.opts,
      sectionPath: officeSectionPath(entry.nodeType),
    },
  }));
}
