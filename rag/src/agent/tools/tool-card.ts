export type ToolCard = {
  id: string;
  description: string;
  nodeType: string;
  args?: Record<string, string>;
  /** Settings owned by that provider: collection id, topK, and so on. */
  config?: Record<string, unknown>;
};

export function parseToolCard(raw: unknown): ToolCard | null {
  let value = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as {
    id?: unknown;
    description?: unknown;
    nodeType?: unknown;
    args?: unknown;
    config?: unknown;
  };
  const id = String(row.id ?? '').trim().toLowerCase();
  const nodeType = String(row.nodeType ?? '').trim();
  if (!id || !nodeType) return null;
  const description = String(row.description ?? id).trim().slice(0, 500);
  const args =
    row.args && typeof row.args === 'object' && !Array.isArray(row.args)
      ? (row.args as Record<string, string>)
      : undefined;
  const config =
    row.config && typeof row.config === 'object' && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : undefined;
  return { id, description, nodeType, args, ...(config ? { config } : {}) };
}

/** Merge whatever provider ports are wired into the router. */
export function collectToolCards(inputs: Record<string, unknown> | null | undefined): ToolCard[] {
  const cards: ToolCard[] = [];
  for (const value of Object.values(inputs ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const card = parseToolCard(item);
        if (card) cards.push(card);
      }
      continue;
    }
    const card = parseToolCard(value);
    if (card) cards.push(card);
  }
  return cards;
}
