/**
 * Bound tool: meta (MCP-facing) + executable source.
 * Produced by ToolInstance, consumed by ToolProvider → MCP attach.
 */

export type ToolInstanceMeta = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolInstancePayload = {
  version: 1;
  meta: ToolInstanceMeta;
  /** Executable body (javascript). Called as async/sync fn(input) → result. */
  source: string;
  language: 'javascript';
};

export function parseToolInstance(raw: unknown): ToolInstancePayload | null {
  if (raw == null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (!obj.meta || typeof obj.meta !== 'object') return null;
  const meta = obj.meta as Record<string, unknown>;
  if (typeof meta.name !== 'string' || !meta.name.trim()) return null;
  if (typeof meta.description !== 'string') return null;
  if (!meta.inputSchema || typeof meta.inputSchema !== 'object') return null;
  if (typeof obj.source !== 'string' || !obj.source.trim()) return null;
  const language = obj.language === 'javascript' || obj.language == null
    ? 'javascript'
    : null;
  if (!language) return null;
  return {
    version: 1,
    meta: {
      name: meta.name.trim(),
      description: meta.description,
      inputSchema: meta.inputSchema as Record<string, unknown>,
    },
    source: obj.source,
    language,
  };
}

export function parseToolInstances(raw: unknown): ToolInstancePayload[] {
  if (raw == null || raw === '') return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      const one = parseToolInstance(trimmed);
      return one ? [one] : [];
    }
  }
  if (Array.isArray(value)) {
    const out: ToolInstancePayload[] = [];
    for (const item of value) {
      const parsed = parseToolInstance(item);
      if (parsed) out.push(parsed);
    }
    return out;
  }
  const one = parseToolInstance(value);
  return one ? [one] : [];
}

export function parseToolMeta(raw: unknown): ToolInstanceMeta | null {
  if (raw == null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const meta = value as Record<string, unknown>;
  if (typeof meta.name !== 'string' || !meta.name.trim()) return null;
  if (typeof meta.description !== 'string') return null;
  if (!meta.inputSchema || typeof meta.inputSchema !== 'object') return null;
  return {
    name: meta.name.trim(),
    description: meta.description,
    inputSchema: meta.inputSchema as Record<string, unknown>,
  };
}
