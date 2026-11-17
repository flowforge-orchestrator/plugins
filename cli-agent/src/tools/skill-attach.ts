/**
 * Opaque skill / rules attach from SkillProvider / RulesProvider.
 * Adapters materialize under /tmp/pack — no baked pack catalog.
 */

export type SkillDoc = {
  name: string;
  body: string;
};

export type SkillAttach = {
  version: 1;
  skills: SkillDoc[];
};

export type RulesAttach = {
  version: 1;
  rules: SkillDoc[];
};

function parseDocList(raw: unknown): SkillDoc[] {
  if (raw == null || raw === '') return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return [];
  const list = obj.skills ?? obj.rules;
  if (!Array.isArray(list)) return [];
  const out: SkillDoc[] = [];
  const names = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()) continue;
    if (typeof row.body !== 'string') continue;
    const name = row.name.trim().replace(/^\/+/, '').split('/').pop() || '';
    if (!name || names.has(name)) continue;
    names.add(name);
    out.push({ name, body: row.body });
  }
  return out;
}

export function parseSkillAttach(raw: unknown): SkillAttach | null {
  const skills = parseDocList(raw);
  if (skills.length === 0) {
    // Distinguish empty attach from invalid: require version envelope when stringy.
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string' && !raw.trim()) return null;
    let value: unknown = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw.trim());
      } catch {
        return null;
      }
    }
    if (
      value &&
      typeof value === 'object' &&
      (value as { version?: unknown }).version === 1 &&
      Array.isArray((value as { skills?: unknown }).skills) &&
      (value as { skills: unknown[] }).skills.length === 0
    ) {
      return { version: 1, skills: [] };
    }
    return null;
  }
  return { version: 1, skills };
}

export function parseRulesAttach(raw: unknown): RulesAttach | null {
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
  // Accept { rules: [...] } or reuse skill-shaped { skills: [...] }.
  const list = Array.isArray(obj.rules)
    ? obj.rules
    : Array.isArray(obj.skills)
      ? obj.skills
      : null;
  if (!list) return null;
  const rules = parseDocList({ version: 1, skills: list });
  return { version: 1, rules };
}

export function agentsMdFromRules(attach: RulesAttach | null): string {
  if (!attach?.rules?.length) return '';
  const hit = attach.rules.find((r) =>
    /^(agents\.md|agents|rules)$/i.test(r.name),
  );
  return (hit ?? attach.rules[0])?.body ?? '';
}

export function skillNamesFromAttach(attach: SkillAttach | null): string[] {
  return attach?.skills.map((s) => s.name) ?? [];
}
