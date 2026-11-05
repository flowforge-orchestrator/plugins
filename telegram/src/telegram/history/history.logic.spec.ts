import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  appendHistory,
  getHistory,
  listChats,
  listHistory,
} from './history.logic';
import { HistoryStore } from './store';

function memoryStore(): HistoryStore {
  return HistoryStore.open(':memory:');
}

describe('telegram history', () => {
  it('writes a message and reads it by id and by chat message', () => {
    const store = memoryStore();
    const saved = appendHistory(store, {
      chatId: '-100',
      messageId: '7',
      direction: 'in',
      text: 'привет',
      fromId: '42',
      fromUsername: 'anna',
      fromFirstName: 'Anna',
      chatType: 'supergroup',
      chatTitle: 'Desk',
      date: 1_700_000_000,
    });
    assert.equal(saved.created, true);
    const byId = getHistory(store, { id: saved.id });
    assert.equal(byId.text, 'привет');
    assert.equal(byId.fromId, '42');
    assert.equal(byId.chatTitle, 'Desk');
    const byMessage = getHistory(store, { chatId: '-100', messageId: '7' });
    assert.equal(byMessage.id, saved.id);
    store.close();
  });

  it('keeps one row for the same update id', () => {
    const store = memoryStore();
    const first = appendHistory(store, {
      chatId: '1',
      direction: 'in',
      updateId: '99',
      text: 'a',
      date: 10,
    });
    const second = appendHistory(store, {
      chatId: '1',
      direction: 'in',
      updateId: '99',
      text: 'b',
      date: 11,
    });
    assert.equal(second.id, first.id);
    assert.equal(second.created, false);
    assert.equal(listHistory(store, {}).total, 1);
    assert.equal(getHistory(store, { id: first.id }).text, 'a');
    store.close();
  });

  it('filters by fields, date range and pages with offset', () => {
    const store = memoryStore();
    appendHistory(store, {
      chatId: 'c1',
      direction: 'in',
      fromId: '1',
      text: 'alpha one',
      date: 10,
    });
    appendHistory(store, {
      chatId: 'c1',
      direction: 'out',
      fromId: '1',
      text: 'alpha two',
      date: 20,
    });
    appendHistory(store, {
      chatId: 'c2',
      direction: 'in',
      fromId: '2',
      text: 'beta',
      date: 30,
    });
    const filtered = listHistory(store, {
      chatId: 'c1',
      direction: 'in',
      textContains: 'alpha',
    });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.messages[0]?.text, 'alpha one');

    const ranged = listHistory(store, { since: 20, until: 30, order: 'oldest' });
    assert.deepEqual(
      ranged.messages.map((row) => row.text),
      ['alpha two', 'beta'],
    );

    const page = listHistory(store, { offset: 1, limit: 1, order: 'oldest' });
    assert.equal(page.total, 3);
    assert.equal(page.offset, 1);
    assert.equal(page.limit, 1);
    assert.equal(page.messages[0]?.text, 'alpha two');
    store.close();
  });

  it('escapes like wildcards in text contains', () => {
    const store = memoryStore();
    appendHistory(store, {
      chatId: 'c',
      direction: 'in',
      text: '100% done',
      date: 1,
    });
    appendHistory(store, {
      chatId: 'c',
      direction: 'in',
      text: '1000 done',
      date: 2,
    });
    const found = listHistory(store, { textContains: '100%' });
    assert.equal(found.total, 1);
    assert.equal(found.messages[0]?.text, '100% done');
    store.close();
  });

  it('lists chats with title filter, sender filter and offset', () => {
    const store = memoryStore();
    appendHistory(store, {
      chatId: 'a',
      direction: 'in',
      fromId: '7',
      chatTitle: 'Alpha desk',
      chatType: 'private',
      date: 1,
    });
    appendHistory(store, {
      chatId: 'a',
      direction: 'out',
      chatTitle: 'Alpha desk',
      date: 3,
    });
    appendHistory(store, {
      chatId: 'b',
      direction: 'in',
      fromId: '8',
      chatTitle: 'Beta',
      chatType: 'group',
      date: 2,
    });
    const all = listChats(store, {});
    assert.equal(all.total, 2);
    assert.equal(all.chats[0]?.chatId, 'a');
    assert.equal(all.chats[0]?.messageCount, 2);
    assert.equal(all.chats[0]?.lastDate, 3);

    const titled = listChats(store, { titleContains: 'desk', chatType: 'private' });
    assert.equal(titled.total, 1);
    assert.equal(titled.chats[0]?.chatId, 'a');

    const bySender = listChats(store, { fromId: '8' });
    assert.equal(bySender.chats[0]?.chatId, 'b');

    const page = listChats(store, { offset: 1, limit: 1 });
    assert.equal(page.total, 2);
    assert.equal(page.chats.length, 1);
    store.close();
  });

  it('reopens the same file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-history-'));
    const path = join(dir, 'history.sqlite');
    const first = HistoryStore.open(path);
    const saved = appendHistory(first, {
      chatId: '9',
      direction: 'out',
      text: 'sent',
      date: 5,
    });
    first.close();
    const second = HistoryStore.open(path);
    assert.equal(getHistory(second, { id: saved.id }).text, 'sent');
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a missing message and a bad direction', () => {
    const store = memoryStore();
    assert.throws(() => getHistory(store, {}), /id or chatId/);
    assert.throws(
      () => appendHistory(store, { chatId: '1', direction: 'sideways' }),
      /direction/,
    );
    store.close();
  });
});
