import type {
  ChatFilter,
  HistoryChat,
  HistoryDirection,
  HistoryMessage,
  HistoryOrder,
  MessageFilter,
  Page,
} from './record';
import type { HistoryStore } from './store';

export type AppendHistoryInput = {
  chatId: string;
  messageId?: string;
  updateId?: string;
  direction: string;
  kind?: string;
  text?: string;
  fromId?: string;
  fromUsername?: string;
  fromFirstName?: string;
  messageThreadId?: string;
  replyToMessageId?: string;
  replyToText?: string;
  chatType?: string;
  chatTitle?: string;
  date?: number;
};

export type ListHistoryInput = MessageFilter & {
  offset?: number;
  limit?: number;
  order?: string;
};

export type GetHistoryInput = {
  id?: number;
  chatId?: string;
  messageId?: string;
};

export type ListChatsInput = ChatFilter & {
  offset?: number;
  limit?: number;
};

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

export function appendHistory(
  store: HistoryStore,
  input: AppendHistoryInput,
): { id: number; chatId: string; messageId: string; created: boolean } {
  const chatId = requiredText(input.chatId, 'chatId');
  const direction = parseDirection(input.direction);
  const saved = store.append({
    chatId,
    messageId: optionalText(input.messageId),
    updateId: optionalText(input.updateId),
    direction,
    kind: optionalText(input.kind),
    text: optionalText(input.text),
    fromId: optionalText(input.fromId),
    fromUsername: optionalText(input.fromUsername),
    fromFirstName: optionalText(input.fromFirstName),
    messageThreadId: optionalText(input.messageThreadId),
    replyToMessageId: optionalText(input.replyToMessageId),
    replyToText: optionalText(input.replyToText),
    chatType: optionalText(input.chatType),
    chatTitle: optionalText(input.chatTitle),
    date: input.date,
  });
  const row = store.getById(saved.id);
  return {
    id: saved.id,
    chatId,
    messageId: row?.messageId ?? optionalText(input.messageId) ?? '',
    created: saved.created,
  };
}

export function listHistory(
  store: HistoryStore,
  input: ListHistoryInput,
): {
  messages: HistoryMessage[];
  total: number;
  offset: number;
  limit: number;
} {
  const page = pageWindow(input.offset, input.limit);
  const filter: MessageFilter = {
    chatId: optionalText(input.chatId),
    messageId: optionalText(input.messageId),
    fromId: optionalText(input.fromId),
    fromUsername: optionalText(input.fromUsername),
    fromFirstName: optionalText(input.fromFirstName),
    direction: optionalDirection(input.direction),
    kind: optionalText(input.kind),
    messageThreadId: optionalText(input.messageThreadId),
    chatType: optionalText(input.chatType),
    chatTitle: optionalText(input.chatTitle),
    replyToMessageId: optionalText(input.replyToMessageId),
    updateId: optionalText(input.updateId),
    text: optionalText(input.text),
    textContains: optionalText(input.textContains),
    since: optionalUnix(input.since),
    until: optionalUnix(input.until),
  };
  const listed = store.list(filter, page, parseOrder(input.order));
  return { ...listed, offset: page.offset, limit: page.limit };
}

export function getHistory(
  store: HistoryStore,
  input: GetHistoryInput,
): HistoryMessage {
  if (input.id != null && input.id > 0) {
    const byId = store.getById(Math.floor(input.id));
    if (!byId) throw new Error(`Message not found: id ${input.id}`);
    return byId;
  }
  const chatId = optionalText(input.chatId);
  const messageId = optionalText(input.messageId);
  if (chatId && messageId) {
    const byMessage = store.getByChatMessage(chatId, messageId);
    if (!byMessage) {
      throw new Error(
        `Message not found: chatId ${chatId} messageId ${messageId}`,
      );
    }
    return byMessage;
  }
  throw new Error('id or chatId with messageId is required');
}

export function listChats(
  store: HistoryStore,
  input: ListChatsInput,
): { chats: HistoryChat[]; total: number; offset: number; limit: number } {
  const page = pageWindow(input.offset, input.limit);
  const listed = store.listChats(
    {
      chatId: optionalText(input.chatId),
      fromId: optionalText(input.fromId),
      chatType: optionalText(input.chatType),
      titleContains: optionalText(input.titleContains),
      since: optionalUnix(input.since),
      until: optionalUnix(input.until),
    },
    page,
  );
  return { ...listed, offset: page.offset, limit: page.limit };
}

export function pageWindow(offset?: number, limit?: number): Page {
  const safeOffset =
    offset == null || !Number.isFinite(offset) ? 0 : Math.max(0, Math.floor(offset));
  const rawLimit =
    limit == null || !Number.isFinite(limit) ? PAGE_DEFAULT : Math.floor(limit);
  return {
    offset: safeOffset,
    limit: Math.min(PAGE_MAX, Math.max(1, rawLimit)),
  };
}

function parseDirection(value: string | undefined): HistoryDirection {
  const direction = optionalText(value);
  if (direction === 'in' || direction === 'out') return direction;
  throw new Error('direction must be in or out');
}

function optionalDirection(value: string | undefined): string | undefined {
  const direction = optionalText(value);
  if (!direction) return undefined;
  return parseDirection(direction);
}

function parseOrder(value: string | undefined): HistoryOrder {
  const order = optionalText(value);
  if (!order || order === 'newest') return 'newest';
  if (order === 'oldest') return 'oldest';
  throw new Error('order must be newest or oldest');
}

function optionalUnix(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value > 10_000_000_000) return Math.floor(value / 1000);
  return Math.floor(value);
}

function requiredText(value: string | undefined, field: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function optionalText(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
