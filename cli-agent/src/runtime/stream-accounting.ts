import { clipOutput, decodeUtf8, STREAM_MAX_BYTES } from './limits';

export type StreamAccounting = {
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
};

export function demuxDockerLogsCapped(buffer: Buffer): StreamAccounting {
  if (!looksMultiplexed(buffer)) {
    return accountPlain(buffer);
  }
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let truncated = false;
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) {
      truncated = true;
      break;
    }
    const chunk = buffer.subarray(start, end);
    if (stream === 2) {
      const room = STREAM_MAX_BYTES - stderrBytes;
      if (room <= 0) {
        truncated = true;
      } else if (chunk.length > room) {
        stderrChunks.push(chunk.subarray(0, room));
        stderrBytes += room;
        truncated = true;
      } else {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    } else {
      const room = STREAM_MAX_BYTES - stdoutBytes;
      if (room <= 0) {
        truncated = true;
      } else if (chunk.length > room) {
        stdoutChunks.push(chunk.subarray(0, room));
        stdoutBytes += room;
        truncated = true;
      } else {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      }
    }
    offset = end;
  }
  return finalize(
    Buffer.concat(stdoutChunks),
    Buffer.concat(stderrChunks),
    stdoutBytes,
    stderrBytes,
    truncated,
  );
}

function accountPlain(buffer: Buffer): StreamAccounting {
  const capped =
    buffer.length > STREAM_MAX_BYTES
      ? buffer.subarray(0, STREAM_MAX_BYTES)
      : buffer;
  const truncated = buffer.length > STREAM_MAX_BYTES;
  return finalize(capped, Buffer.alloc(0), capped.length, 0, truncated);
}

function finalize(
  stdoutBuf: Buffer,
  stderrBuf: Buffer,
  stdoutBytes: number,
  stderrBytes: number,
  truncated: boolean,
): StreamAccounting {
  const stdoutDecoded = decodeUtf8(stdoutBuf);
  const stderrDecoded = decodeUtf8(stderrBuf);
  const stdoutClipped = clipOutput(stdoutDecoded.text);
  const stderrClipped = clipOutput(stderrDecoded.text);
  return {
    stdout: stdoutClipped.text,
    stderr: stderrClipped.text,
    stdoutBytes,
    stderrBytes,
    truncated:
      truncated ||
      stdoutDecoded.replaced ||
      stderrDecoded.replaced ||
      stdoutClipped.truncated ||
      stderrClipped.truncated,
  };
}

function looksMultiplexed(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }
  const stream = buffer[0];
  if (stream !== 1 && stream !== 2) {
    return false;
  }
  const size = buffer.readUInt32BE(4);
  return size <= buffer.length - 8;
}
