/**
 * Bound skill/rules document: name + markdown body.
 * Produced by SkillInstance / RulesInstance, consumed by providers.
 */

export type SkillInstancePayload = {
  version: 1;
  name: string;
  body: string;
};

export function parseSkillInstance(raw: unknown): SkillInstancePayload | null {
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
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  if (typeof obj.body !== 'string') return null;
  return {
    version: 1,
    name: obj.name.trim().replace(/^\/+/, '').split('/').pop() || '',
    body: obj.body,
  };
}
