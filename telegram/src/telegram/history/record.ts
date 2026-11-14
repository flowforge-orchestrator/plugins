export type HistoryDirection = 'in' | 'out';

export type HistoryOrder = 'newest' | 'oldest';

export type HistoryMessage = {
  id: number;
  chatId: string;
  messageId: string;
  updateId: string;
  direction: string;
  kind: string;
  text: string;
  fromId: string;
  fromUsername: string;
  fromFirstName: string;
  messageThreadId: string;
  replyToMessageId: string;
  replyToText: string;
  chatType: string;
  chatTitle: string;
  date: number;
};

export type HistoryChat = {
  chatId: string;
  chatType: string;
  chatTitle: string;
  lastDate: number;
  messageCount: number;
};

export type MessageFilter = {
  chatId?: string;
  messageId?: string;
  fromId?: string;
  fromUsername?: string;
  fromFirstName?: string;
  direction?: string;
  kind?: string;
  messageThreadId?: string;
  chatType?: string;
  chatTitle?: string;
  replyToMessageId?: string;
  updateId?: string;
  text?: string;
  textContains?: string;
  since?: number;
  until?: number;
};

export type ChatFilter = {
  chatId?: string;
  fromId?: string;
  chatType?: string;
  titleContains?: string;
  since?: number;
  until?: number;
};

export type Page = {
  offset: number;
  limit: number;
};

export type AppendRecord = {
  chatId: string;
  messageId?: string;
  updateId?: string;
  direction: HistoryDirection;
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
