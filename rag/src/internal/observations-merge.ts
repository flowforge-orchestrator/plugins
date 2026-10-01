import { toJsonPort } from './json-port';
import {
  normalizeObservations,
  type AgentObservations,
} from '../agent/turn/agent.turn.logic';

/** When `action` is unset, the node always runs (linear presets). */
export function shouldRunForAction(
  action: unknown,
  expected: string,
): boolean {
  if (action == null || action === '') return true;
  return String(action).trim().toLowerCase() === expected;
}

export function isEnabledFlag(enabled: unknown): boolean {
  if (enabled === false || enabled === 'false' || enabled === 0 || enabled === '0') {
    return false;
  }
  return true;
}

export function mergeObservations(
  raw: unknown,
  patch: Partial<AgentObservations>,
  note?: string,
): { observations: AgentObservations; observationsJson: string } {
  const base = normalizeObservations(raw);
  const turnNotes = [...(base.turnNotes ?? [])];
  if (note) turnNotes.push(note);
  const observations: AgentObservations = {
    ...base,
    ...patch,
    turnNotes: turnNotes.length ? turnNotes : undefined,
  };
  return { observations, observationsJson: toJsonPort(observations) };
}

export function observationsContext(raw: unknown): string {
  return normalizeObservations(raw).context ?? '';
}

export function observationsFrameJson(raw: unknown): string {
  const frame = normalizeObservations(raw).frame;
  return frame ? toJsonPort(frame) : '';
}
