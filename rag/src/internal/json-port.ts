/**
 * Conveyor persists textarea ports as JSON-ish scalars. Nested objects/arrays
 * often arrive mangled (`[[]]`) unless we round-trip through JSON strings.
 */

export function toJsonPort(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null);
}

export function fromJsonPort<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
