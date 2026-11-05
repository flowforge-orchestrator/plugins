import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AppendRecord,
  ChatFilter,
  HistoryChat,
  HistoryMessage,
  HistoryOrder,
  MessageFilter,
  Page,
} from './record';

type MessageRow = {
  id: number;
  chat_id: string;
  message_id: string | null;
  update_id: string | null;
  direction: string;
  kind: string;
  text: string | null;
  from_id: string | null;
  from_username: string | null;
  from_first_name: string | null;
  message_thread_id: string | null;
  reply_to_message_id: string | null;
  reply_to_text: string | null;
  chat_type: string | null;
  chat_title: string | null;
  date: number;
};

type ChatRow = {
  chat_id: string;
  chat_type: string | null;
  chat_title: string | null;
  last_date: number;
  message_count: number;
};

type CountRow = { total: number };
type IdRow = { id: number };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id TEXT,
  update_id TEXT,
  direction TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT,
  from_id TEXT,
  from_username TEXT,
  from_first_name TEXT,
  message_thread_id TEXT,
  reply_to_message_id TEXT,
  reply_to_text TEXT,
  chat_type TEXT,
  chat_title TEXT,
  date INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat_date ON messages(chat_id, date, id);
CREATE INDEX IF NOT EXISTS messages_from ON messages(from_id);
CREATE UNIQUE INDEX IF NOT EXISTS messages_update_id_uq
  ON messages(update_id)
  WHERE update_id IS NOT NULL AND update_id <> '';
`;

export function defaultHistoryPath(): string {
  const fromEnv = process.env.TELEGRAM_HISTORY_PATH?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), '.conveyor', 'telegram-history.sqlite');
}

export class HistoryStore {
  constructor(private readonly db: DatabaseSync) {}

  static open(path: string): HistoryStore {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    const db = new DatabaseSync(path);
    db.exec('PRAGMA busy_timeout = 5000');
    if (path !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
    }
    db.exec(SCHEMA);
    return new HistoryStore(db);
  }

  close(): void {
    this.db.close();
  }

  append(record: AppendRecord): { id: number; created: boolean } {
    const updateId = emptyToNull(record.updateId);
    if (updateId) {
      const existing = this.db
        .prepare('SELECT id FROM messages WHERE update_id = ?')
        .get(updateId) as IdRow | undefined;
      if (existing) return { id: existing.id, created: false };
    }
    const date = toUnixSeconds(record.date);
    try {
      const info = this.db
        .prepare(
          `INSERT INTO messages (
            chat_id, message_id, update_id, direction, kind, text,
            from_id, from_username, from_first_name, message_thread_id,
            reply_to_message_id, reply_to_text, chat_type, chat_title, date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.chatId,
          emptyToNull(record.messageId),
          updateId,
          record.direction,
          record.kind?.trim() || 'message',
          emptyToNull(record.text),
          emptyToNull(record.fromId),
          emptyToNull(record.fromUsername),
          emptyToNull(record.fromFirstName),
          emptyToNull(record.messageThreadId),
          emptyToNull(record.replyToMessageId),
          emptyToNull(record.replyToText),
          emptyToNull(record.chatType),
          emptyToNull(record.chatTitle),
          date,
        );
      return { id: Number(info.lastInsertRowid), created: true };
    } catch (err: unknown) {
      if (updateId && isUniqueConstraint(err)) {
        const existing = this.db
          .prepare('SELECT id FROM messages WHERE update_id = ?')
          .get(updateId) as IdRow | undefined;
        if (existing) return { id: existing.id, created: false };
      }
      throw err;
    }
  }

  getById(id: number): HistoryMessage | undefined {
    const row = this.db
      .prepare('SELECT * FROM messages WHERE id = ?')
      .get(id) as MessageRow | undefined;
    return row ? mapMessage(row) : undefined;
  }

  getByChatMessage(
    chatId: string,
    messageId: string,
  ): HistoryMessage | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM messages
         WHERE chat_id = ? AND message_id = ?
         ORDER BY date DESC, id DESC
         LIMIT 1`,
      )
      .get(chatId, messageId) as MessageRow | undefined;
    return row ? mapMessage(row) : undefined;
  }

  list(
    filter: MessageFilter,
    page: Page,
    order: HistoryOrder,
  ): { messages: HistoryMessage[]; total: number } {
    const { clause, params } = messageWhere(filter);
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS total FROM messages ${clause}`)
      .get(...params) as CountRow;
    const direction = order === 'oldest' ? 'ASC' : 'DESC';
    const rows = this.db
      .prepare(
        `SELECT * FROM messages ${clause}
         ORDER BY date ${direction}, id ${direction}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, page.limit, page.offset) as MessageRow[];
    return {
      messages: rows.map(mapMessage),
      total: Number(totalRow.total),
    };
  }

  listChats(
    filter: ChatFilter,
    page: Page,
  ): { chats: HistoryChat[]; total: number } {
    const { clause, params } = chatWhere(filter);
    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total FROM (
           SELECT chat_id FROM messages ${clause} GROUP BY chat_id
         )`,
      )
      .get(...params) as CountRow;
    const rows = this.db
      .prepare(
        `SELECT m.chat_id, m.chat_type, m.chat_title, m.date AS last_date, c.message_count
         FROM messages m
         INNER JOIN (
           SELECT chat_id, MAX(id) AS max_id, COUNT(*) AS message_count
           FROM messages
           ${clause}
           GROUP BY chat_id
         ) c ON m.id = c.max_id
         ORDER BY m.date DESC, m.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, page.limit, page.offset) as ChatRow[];
    return {
      chats: rows.map(mapChat),
      total: Number(totalRow.total),
    };
  }
}

let singleton: HistoryStore | null = null;

export function getHistoryStore(): HistoryStore {
  if (!singleton) {
    singleton = HistoryStore.open(defaultHistoryPath());
  }
  return singleton;
}

function messageWhere(filter: MessageFilter): {
  clause: string;
  params: Array<string | number>;
} {
  const parts: string[] = [];
  const params: Array<string | number> = [];
  const equals: Array<[string, string | undefined]> = [
    ['chat_id', filter.chatId],
    ['message_id', filter.messageId],
    ['from_id', filter.fromId],
    ['from_username', filter.fromUsername],
    ['from_first_name', filter.fromFirstName],
    ['direction', filter.direction],
    ['kind', filter.kind],
    ['message_thread_id', filter.messageThreadId],
    ['chat_type', filter.chatType],
    ['chat_title', filter.chatTitle],
    ['reply_to_message_id', filter.replyToMessageId],
    ['update_id', filter.updateId],
    ['text', filter.text],
  ];
  for (const [column, value] of equals) {
    if (!value) continue;
    parts.push(`${column} = ?`);
    params.push(value);
  }
  if (filter.textContains) {
    parts.push(`IFNULL(text, '') LIKE ? ESCAPE '\\'`);
    params.push(likeContains(filter.textContains));
  }
  if (filter.since != null) {
    parts.push('date >= ?');
    params.push(filter.since);
  }
  if (filter.until != null) {
    parts.push('date <= ?');
    params.push(filter.until);
  }
  return {
    clause: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '',
    params,
  };
}

function chatWhere(filter: ChatFilter): {
  clause: string;
  params: Array<string | number>;
} {
  const parts: string[] = [];
  const params: Array<string | number> = [];
  if (filter.chatId) {
    parts.push('chat_id = ?');
    params.push(filter.chatId);
  }
  if (filter.fromId) {
    parts.push('from_id = ?');
    params.push(filter.fromId);
  }
  if (filter.chatType) {
    parts.push('chat_type = ?');
    params.push(filter.chatType);
  }
  if (filter.titleContains) {
    parts.push(`IFNULL(chat_title, '') LIKE ? ESCAPE '\\'`);
    params.push(likeContains(filter.titleContains));
  }
  if (filter.since != null) {
    parts.push('date >= ?');
    params.push(filter.since);
  }
  if (filter.until != null) {
    parts.push('date <= ?');
    params.push(filter.until);
  }
  return {
    clause: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '',
    params,
  };
}

function mapMessage(row: MessageRow): HistoryMessage {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    messageId: row.message_id ?? '',
    updateId: row.update_id ?? '',
    direction: row.direction,
    kind: row.kind,
    text: row.text ?? '',
    fromId: row.from_id ?? '',
    fromUsername: row.from_username ?? '',
    fromFirstName: row.from_first_name ?? '',
    messageThreadId: row.message_thread_id ?? '',
    replyToMessageId: row.reply_to_message_id ?? '',
    replyToText: row.reply_to_text ?? '',
    chatType: row.chat_type ?? '',
    chatTitle: row.chat_title ?? '',
    date: Number(row.date),
  };
}

function mapChat(row: ChatRow): HistoryChat {
  return {
    chatId: row.chat_id,
    chatType: row.chat_type ?? '',
    chatTitle: row.chat_title ?? '',
    lastDate: Number(row.last_date),
    messageCount: Number(row.message_count),
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function likeContains(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

function toUnixSeconds(value: number | undefined): number {
  const raw = value ?? Math.floor(Date.now() / 1000);
  if (raw > 10_000_000_000) return Math.floor(raw / 1000);
  return Math.floor(raw);
}

function isUniqueConstraint(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('UNIQUE');
}
