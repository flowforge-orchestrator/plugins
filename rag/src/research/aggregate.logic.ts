import type { Evidence } from './model';

export type AggregateOp = 'count' | 'sum' | 'min' | 'max';

const OPS = new Set<string>(['count', 'sum', 'min', 'max']);

export function aggregateEvidence(input: {
  evidence: Evidence[];
  op: string;
}): { evidence: Evidence[]; limitation?: string } {
  const op = input.op.trim().toLowerCase();
  if (!OPS.has(op)) {
    return { evidence: [], limitation: 'aggregate op is not count, sum, min, or max' };
  }
  const groups = new Map<string, Evidence[]>();
  for (const row of input.evidence) {
    const key = row.group || row.location || '';
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  if (groups.size === 0) return { evidence: [], limitation: 'nothing to aggregate' };

  const out: Evidence[] = [];
  for (const [group, rows] of groups) {
    const numbers = rows
      .map((row) => row.value)
      .filter((value): value is number => typeof value === 'number');
    if (op !== 'count' && numbers.length === 0) continue;
    const value =
      op === 'count'
        ? rows.length
        : op === 'sum'
          ? numbers.reduce((sum, item) => sum + item, 0)
          : op === 'min'
            ? Math.min(...numbers)
            : Math.max(...numbers);
    const parents = rows.map((row) => row.id);
    out.push({
      id: `agg:${op}:${group || 'all'}:${parents.join('+').slice(0, 80)}`,
      source: rows[0]?.source ?? 'aggregate',
      location: group,
      content: String(value),
      extractionMethod: `aggregate:${op}`,
      parentEvidence: parents,
      reliability: 'computed',
      kind: 'derived',
      value,
      ...(group ? { group } : {}),
    });
  }
  if (out.length === 0) {
    return { evidence: [], limitation: 'no numeric values to aggregate' };
  }
  return { evidence: out };
}
