/** Pure echo logic — unit-test without Nest. */
export function echoMetrics(text: string): { text: string; length: number } {
  const normalized = text.trim();
  return { text: normalized, length: normalized.length };
}
