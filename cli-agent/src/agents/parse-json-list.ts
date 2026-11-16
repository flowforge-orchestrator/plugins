export type JsonListParse =
  | { ok: true; items: string[] }
  | { ok: false; reason: string };

/**
 * Empty / missing → default (empty list).
 * Accepts a JSON string array, an already-parsed string[], or whitespace.
 * Runtime may deliver jsonb defaults as arrays rather than strings.
 */
export function parseJsonStringList(
  raw: string | readonly string[] | undefined | null,
  field: 'tools' | 'skills' | 'roster',
): JsonListParse {
  if (raw == null) {
    return { ok: true, items: [] };
  }
  let parsed: unknown;
  if (Array.isArray(raw)) {
    parsed = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: true, items: [] };
    }
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return { ok: false, reason: `${field} must be a JSON array of strings` };
    }
  } else {
    return { ok: false, reason: `${field} must be a JSON array of strings` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, reason: `${field} must be a JSON array of strings` };
  }
  const items: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string' || !item.trim()) {
      return { ok: false, reason: `${field} must be a JSON array of strings` };
    }
    items.push(item);
  }
  return { ok: true, items };
}
