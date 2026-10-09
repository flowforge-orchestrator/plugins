/** Parse «Знание: документ» (and intake) run results for the validate form. */

import { asRecord } from '../lib/ui-kit';

export type KnowledgeDocResult = {
  evidenceId: string | null;
  committedClaimIds: string[];
  conflictIds: string[];
  schemaVersion: number | null;
};

function asIdList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : String(v ?? '')).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return asIdList(parsed);
    } catch {
      // comma / whitespace separated
    }
    return trimmed
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function asOptionalString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Pull knowledge-document fields from a process run result.
 * Accepts nested `publicInputs` or a flat result object.
 */
export function parseKnowledgeDocResult(result: unknown): KnowledgeDocResult {
  const root = asRecord(result);
  const inputs = asRecord(root.publicInputs ?? root);
  return {
    evidenceId: asOptionalString(inputs.evidenceId ?? root.evidenceId),
    committedClaimIds: asIdList(
      inputs.committedClaimIds ?? root.committedClaimIds,
    ),
    conflictIds: asIdList(inputs.conflictIds ?? root.conflictIds),
    schemaVersion: asOptionalNumber(
      inputs.schemaVersion ?? root.schemaVersion,
    ),
  };
}

export function formatKnowledgeDocSummary(parsed: KnowledgeDocResult): string {
  const parts: string[] = [];
  if (parsed.evidenceId) parts.push(`evidenceId: ${parsed.evidenceId}`);
  if (parsed.committedClaimIds.length) {
    parts.push(`claims: ${parsed.committedClaimIds.join(', ')}`);
  }
  if (parsed.conflictIds.length) {
    parts.push(`conflicts: ${parsed.conflictIds.join(', ')}`);
  }
  if (parsed.schemaVersion != null) {
    parts.push(`schemaVersion: ${parsed.schemaVersion}`);
  }
  return parts.length ? parts.join('\n') : 'Результат без evidenceId / claims';
}
