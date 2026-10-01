import type { Evidence } from './model';

export type CalculateOp = 'add' | 'sub' | 'mul' | 'div';

const OPS = new Set<string>(['add', 'sub', 'mul', 'div']);

/** Arithmetic over two evidence records that already carry a number. No expression language. */
export function calculateEvidence(input: {
  evidence: Evidence[];
  op: string;
  leftId: string;
  rightId: string;
}): { evidence: Evidence[]; limitation?: string } {
  const op = input.op.trim().toLowerCase();
  if (!OPS.has(op)) return { evidence: [], limitation: 'calculate op is not add, sub, mul, or div' };
  const left = input.evidence.find((row) => row.id === input.leftId);
  const right = input.evidence.find((row) => row.id === input.rightId);
  if (!left || !right) return { evidence: [], limitation: 'calculate inputs are not in evidence' };
  if (typeof left.value !== 'number' || typeof right.value !== 'number') {
    return { evidence: [], limitation: 'calculate inputs are not numbers' };
  }
  if (op === 'div' && right.value === 0) {
    return { evidence: [], limitation: 'division by zero' };
  }
  const value =
    op === 'add'
      ? left.value + right.value
      : op === 'sub'
        ? left.value - right.value
        : op === 'mul'
          ? left.value * right.value
          : left.value / right.value;
  return {
    evidence: [
      {
        id: `calc:${op}:${left.id}:${right.id}`,
        source: left.source,
        location: left.location,
        content: String(value),
        extractionMethod: `calculate:${op}`,
        parentEvidence: [left.id, right.id],
        reliability: 'computed',
        kind: 'derived',
        value,
      },
    ],
  };
}
