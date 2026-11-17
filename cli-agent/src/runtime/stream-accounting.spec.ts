import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_MAX_CHARS, STREAM_MAX_BYTES } from './limits';
import { demuxDockerLogsCapped } from './stream-accounting';

function frame(stream: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe('demuxDockerLogsCapped', () => {
  it('splits multiplexed stdout and stderr', () => {
    const result = demuxDockerLogsCapped(
      Buffer.concat([frame(1, Buffer.from('out')), frame(2, Buffer.from('err'))]),
    );
    assert.equal(result.stdout, 'out');
    assert.equal(result.stderr, 'err');
    assert.equal(result.stdoutBytes, 3);
    assert.equal(result.stderrBytes, 3);
    assert.equal(result.truncated, false);
  });

  it('caps stream bytes and marks truncated', () => {
    const big = Buffer.alloc(STREAM_MAX_BYTES + 50, 0x61);
    const result = demuxDockerLogsCapped(frame(1, big));
    assert.equal(result.stdoutBytes, STREAM_MAX_BYTES);
    assert.equal(result.truncated, true);
    assert.ok(result.stdout.length <= OUTPUT_MAX_CHARS + 40);
    assert.ok(result.stdout.includes('…truncated'));
  });

  it('marks truncated when UTF-8 is invalid', () => {
    const result = demuxDockerLogsCapped(Buffer.from([0xff, 0xfe, 0xfd]));
    assert.equal(result.truncated, true);
    assert.ok(result.stdout.length > 0);
  });
});
