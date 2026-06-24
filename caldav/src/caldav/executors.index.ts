import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { CaldavCreateEventExecutor } from './create-event/executor';
import { CaldavDeleteEventExecutor } from './delete-event/executor';
import { CaldavGetEventExecutor } from './get-event/executor';
import { CaldavListCalendarsExecutor } from './list-calendars/executor';
import { CaldavListEventsExecutor } from './list-events/executor';
import { CaldavUpdateEventExecutor } from './update-event/executor';

const EXECUTOR_CLASSES = [
  CaldavListCalendarsExecutor,
  CaldavListEventsExecutor,
  CaldavGetEventExecutor,
  CaldavCreateEventExecutor,
  CaldavUpdateEventExecutor,
  CaldavDeleteEventExecutor,
] as const;

export function getCaldavExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
