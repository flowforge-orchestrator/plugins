import { createHash } from 'crypto';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function shortId(seed: string, length = 24): string {
  return sha256Hex(seed).slice(0, length);
}
