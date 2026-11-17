import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { demuxDockerLogs } from './docker-engine';

describe('demuxDockerLogs', () => {
  it('returns raw text when the buffer is not framed', () => {
    assert.deepEqual(demuxDockerLogs(Buffer.from('hello')), { stdout: 'hello', stderr: '' });
  });

  it('splits one stdout frame and one stderr frame', () => {
    const frame = (stream: number, text: string): Buffer => {
      const payload = Buffer.from(text);
      const header = Buffer.alloc(8);
      header[0] = stream;
      header.writeUInt32BE(payload.length, 4);
      return Buffer.concat([header, payload]);
    };
    assert.deepEqual(demuxDockerLogs(Buffer.concat([frame(1, 'out'), frame(2, 'err')])), {
      stdout: 'out',
      stderr: 'err',
    });
  });
});
