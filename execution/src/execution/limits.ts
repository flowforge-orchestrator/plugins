export const SOURCE_MAX_CHARS = 16_000;
export const TIMEOUT_MIN_MS = 100;
export const TIMEOUT_MAX_MS = 30_000;
export const TIMEOUT_DEFAULT_MS = 1_000;
export const OUTPUT_MAX_CHARS = 64_000;

export function clampTimeout(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return TIMEOUT_DEFAULT_MS;
  }
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.floor(parsed)));
}

export function assertSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('source is required');
  }
  if (trimmed.length > SOURCE_MAX_CHARS) {
    throw new Error(`source exceeds ${SOURCE_MAX_CHARS} characters`);
  }
  return trimmed;
}

export function clipOutput(text: string): string {
  if (text.length <= OUTPUT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, OUTPUT_MAX_CHARS)}\n…truncated`;
}
