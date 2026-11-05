import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { TelegramHistoryAppendExecutor } from './history/append/append.executor';
import { TelegramHistoryChatsExecutor } from './history/chats/chats.executor';
import { TelegramHistoryGetExecutor } from './history/get/get.executor';
import { TelegramHistoryListExecutor } from './history/list/list.executor';
import { TelegramSendExecutor } from './send/send.executor';

const EXECUTOR_CLASSES = [
  TelegramSendExecutor,
  TelegramHistoryAppendExecutor,
  TelegramHistoryListExecutor,
  TelegramHistoryGetExecutor,
  TelegramHistoryChatsExecutor,
] as const;

export function getTelegramExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
