/** pi/opencode JSON modes emit large event streams; keep head+tail for tools+answer. */
export const STREAM_MAX_BYTES = 512_000;
export const OUTPUT_MAX_CHARS = 96_000;
export const TIMEOUT_MIN_MS = 1_000;
export const TIMEOUT_MAX_MS = 30 * 60 * 1_000;
export const TIMEOUT_DEFAULT_MS = 10 * 60 * 1_000;
export const MEMORY_BYTES = 2 * 1024 * 1024 * 1024;
export const PIDS_LIMIT = 256;

export function clampTimeout(value: unknown): number {
  // Number('') === 0 (finite) — treat blank as unset, not 0→MIN(1s).
  if (value === '' || value === null || value === undefined) {
    return TIMEOUT_DEFAULT_MS;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return TIMEOUT_DEFAULT_MS;
  }
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.floor(parsed)));
}

export function clipOutput(text: string): { text: string; truncated: boolean } {
  if (text.length <= OUTPUT_MAX_CHARS) {
    return { text, truncated: false };
  }
  // Keep head (early tool calls) + tail (final answer) for JSON-mode CLIs.
  const marker = '\n…truncated\n';
  const budget = OUTPUT_MAX_CHARS - marker.length;
  const head = Math.floor(budget * 0.55);
  const tail = budget - head;
  return {
    text: `${text.slice(0, head)}${marker}${text.slice(-tail)}`,
    truncated: true,
  };
}

export function decodeUtf8(buffer: Buffer): { text: string; replaced: boolean } {
  try {
    const fatal = new TextDecoder('utf-8', { fatal: true });
    return { text: fatal.decode(buffer), replaced: false };
  } catch {
    const loose = new TextDecoder('utf-8', { fatal: false });
    return { text: loose.decode(buffer), replaced: true };
  }
}
