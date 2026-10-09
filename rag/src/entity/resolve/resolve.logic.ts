import { createHash } from 'crypto';
import type {
  CanonicalEntity,
  EntityMention,
  SchemaDelta,
} from '../../contracts/types';
import type { EntityDecision } from '../../contracts/knowledge';
import {
  createSynonymDictionary,
  resolveSurface,
  type SynonymDictionary,
  DEFAULT_NARRATIVE_SYNONYMS,
} from '../../spo/synonym.logic';
import { normalizeEntityLabel } from '../normalize-label';

export { normalizeEntityLabel };

function identityKey(
  typeId: string,
  identityValues?: Record<string, string>,
  label?: string,
): string {
  if (identityValues && Object.keys(identityValues).length > 0) {
    return `${typeId}|${JSON.stringify(identityValues)}`;
  }
  return `${typeId}|${normalizeEntityLabel(label ?? '')}`;
}

function entityIdFromKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function applyTypeRemap(
  typeId: string,
  delta: SchemaDelta | null | undefined,
): string {
  if (!delta) return typeId;
  let current = typeId;
  for (const op of delta.operations) {
    if (op.kind !== 'entity') continue;
    if (op.op === 'ALIAS' && op.fromId === current) current = op.toId;
    if (op.op === 'MERGE' && op.fromIds.includes(current)) current = op.intoId;
  }
  return current;
}

function labelScore(a: string, b: string): number {
  const left = normalizeEntityLabel(a);
  const right = normalizeEntityLabel(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.7;
  return 0;
}

function entitySurfaceScore(entity: CanonicalEntity, surface: string): number {
  let best = labelScore(entity.label, surface);
  for (const alias of entity.aliases ?? []) {
    best = Math.max(best, labelScore(alias, surface));
  }
  return best;
}

function addAlias(entity: CanonicalEntity, surface: string): void {
  const s = surface.trim();
  if (!s) return;
  if (normalizeEntityLabel(entity.label) === normalizeEntityLabel(s)) return;
  if (!entity.aliases) entity.aliases = [];
  if (
    entity.aliases.some(
      (a) => normalizeEntityLabel(a) === normalizeEntityLabel(s),
    )
  ) {
    return;
  }
  entity.aliases.push(s);
}

function attachMention(entity: CanonicalEntity, mentionId: string): void {
  if (!entity.mentionIds.includes(mentionId)) {
    entity.mentionIds.push(mentionId);
  }
}

export function resolveEntities(input: {
  mentions: EntityMention[];
  existing: CanonicalEntity[];
  delta?: SchemaDelta | null;
  /** Below this top score gap vs runner-up → ambiguous. */
  ambiguityThreshold?: number;
  /** Synonym bag; defaults to narrative seeds. */
  synonyms?: SynonymDictionary;
}): {
  entities: CanonicalEntity[];
  merged: number;
  created: number;
  rebound: number;
  decisions: EntityDecision[];
} {
  const ambiguityThreshold = Number(input.ambiguityThreshold ?? 0.15);
  const dict =
    input.synonyms ??
    createSynonymDictionary({
      entities: [...DEFAULT_NARRATIVE_SYNONYMS.entities],
      predicates: [...DEFAULT_NARRATIVE_SYNONYMS.predicates],
    });
  const byKey = new Map<string, CanonicalEntity>();
  let rebound = 0;
  for (const entity of input.existing) {
    const typeId = applyTypeRemap(entity.typeId, input.delta);
    if (typeId !== entity.typeId) rebound += 1;
    const key = identityKey(typeId, entity.identityValues, entity.label);
    const copy: CanonicalEntity = {
      ...entity,
      typeId,
      aliases: [...(entity.aliases ?? [])],
      mentionIds: [...entity.mentionIds],
    };
    byKey.set(key, copy);
    dict.learnAlias(copy.label, copy.label);
    for (const a of copy.aliases ?? []) dict.learnAlias(copy.label, a);
  }

  let created = 0;
  let merged = 0;
  const decisions: EntityDecision[] = [];

  for (const mention of input.mentions) {
    const typeId = applyTypeRemap(mention.typeId, input.delta);
    const resolved = resolveSurface(dict, mention.surface);
    const preferredLabel = resolved.matched
      ? resolved.canonical
      : mention.surface;
    const key = identityKey(
      typeId,
      mention.identityValues,
      preferredLabel,
    );
    const existing = byKey.get(key);
    if (existing) {
      merged += 1;
      attachMention(existing, mention.mentionId);
      addAlias(existing, mention.surface);
      dict.learnAlias(existing.label, mention.surface);
      decisions.push({
        mentionId: mention.mentionId,
        kind: 'match',
        entityId: existing.entityId,
        score: 1,
      });
      continue;
    }

    // Exact label or alias across types: extend the existing node.
    const crossExact = [...byKey.values()].find((e) => {
      if (
        normalizeEntityLabel(e.label) ===
        normalizeEntityLabel(preferredLabel)
      ) {
        return true;
      }
      if (
        normalizeEntityLabel(e.label) ===
        normalizeEntityLabel(mention.surface)
      ) {
        return true;
      }
      return (e.aliases ?? []).some(
        (a) =>
          normalizeEntityLabel(a) === normalizeEntityLabel(mention.surface) ||
          normalizeEntityLabel(a) === normalizeEntityLabel(preferredLabel),
      );
    });
    if (crossExact) {
      merged += 1;
      attachMention(crossExact, mention.mentionId);
      addAlias(crossExact, mention.surface);
      dict.learnAlias(crossExact.label, mention.surface);
      decisions.push({
        mentionId: mention.mentionId,
        kind: 'match',
        entityId: crossExact.entityId,
        score: 1,
      });
      continue;
    }

    const scored = [...byKey.values()]
      .map((e) => ({
        entity: e,
        score: entitySurfaceScore(e, mention.surface),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length >= 2) {
      const top = scored[0]!;
      const second = scored[1]!;
      if (top.score - second.score < ambiguityThreshold) {
        decisions.push({
          mentionId: mention.mentionId,
          kind: 'ambiguous',
          candidates: scored.slice(0, 5).map((s) => s.entity.entityId),
          score: top.score,
        });
        continue;
      }
    }

    if (scored[0] && scored[0].score >= 0.7) {
      const match = scored[0].entity;
      merged += 1;
      attachMention(match, mention.mentionId);
      addAlias(match, mention.surface);
      dict.learnAlias(match.label, mention.surface);
      decisions.push({
        mentionId: mention.mentionId,
        kind: 'match',
        entityId: match.entityId,
        score: scored[0].score,
      });
      continue;
    }

    created += 1;
    const entityId = entityIdFromKey(key);
    const entity: CanonicalEntity = {
      entityId,
      typeId,
      label: preferredLabel,
      aliases:
        normalizeEntityLabel(preferredLabel) ===
        normalizeEntityLabel(mention.surface)
          ? []
          : [mention.surface],
      identityValues: mention.identityValues,
      mentionIds: [mention.mentionId],
    };
    byKey.set(key, entity);
    dict.learnAlias(entity.label, entity.label);
    for (const a of entity.aliases ?? []) dict.learnAlias(entity.label, a);
    decisions.push({
      mentionId: mention.mentionId,
      kind: 'new',
      entityId,
      score: 1,
    });
  }

  return {
    entities: [...byKey.values()],
    merged,
    created,
    rebound,
    decisions,
  };
}
