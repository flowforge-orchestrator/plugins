import { toJsonPort } from '../../internal/json-port';
import {
  normalizeObservations,
  type AgentObservations,
} from './agent.turn.logic';

type HistoryTurn = { role: string; name?: string; text: string };

function turnsOf(raw: unknown): HistoryTurn[] {
  let value = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const turns: HistoryTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { role?: unknown; name?: unknown; text?: unknown };
    const role = String(row.role ?? '').trim();
    const text = String(row.text ?? '');
    if (!role) continue;
    turns.push({
      role,
      ...(typeof row.name === 'string' && row.name ? { name: row.name } : {}),
      text,
    });
  }
  return turns;
}

/** Tool results ride in history as role `tool`. The latest one is the working state. */
export function observationsFromHistory(raw: unknown): AgentObservations {
  const tool = [...turnsOf(raw)].reverse().find((turn) => turn.role === 'tool');
  if (!tool?.text.trim()) return {};
  return normalizeObservations(tool.text);
}

export function historyWithToolResult(
  raw: unknown,
  toolId: string,
  observations: AgentObservations,
): string {
  const kept = turnsOf(raw).filter((turn) => turn.role !== 'tool');
  kept.push({
    role: 'tool',
    name: toolId,
    text: toJsonPort(observations),
  });
  return toJsonPort(kept);
}
