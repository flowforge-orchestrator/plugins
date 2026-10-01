import { createHash } from 'crypto';
import type {
  CanonicalEntity,
  EntityMention,
  SchemaDelta,
} from '../../contracts/types';

function identityKey(
  typeId: string,
  identityValues?: Record<string, string>,
  label?: string,
): string {
  if (identityValues && Object.keys(identityValues).length > 0) {
    return `${typeId}|${JSON.stringify(identityValues)}`;
  }
  return `${typeId}|${(label ?? '').trim().toLowerCase()}`;
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

export function resolveEntities(input: {
  mentions: EntityMention[];
  existing: CanonicalEntity[];
  delta?: SchemaDelta | null;
}): { entities: CanonicalEntity[]; merged: number; created: number; rebound: number } {
  const byKey = new Map<string, CanonicalEntity>();
  let rebound = 0;
  for (const entity of input.existing) {
    const typeId = applyTypeRemap(entity.typeId, input.delta);
    if (typeId !== entity.typeId) rebound += 1;
    const key = identityKey(typeId, entity.identityValues, entity.label);
    byKey.set(key, {
      ...entity,
      typeId,
      mentionIds: [...entity.mentionIds],
    });
  }

  let created = 0;
  let merged = 0;
  for (const mention of input.mentions) {
    const typeId = applyTypeRemap(mention.typeId, input.delta);
    const key = identityKey(typeId, mention.identityValues, mention.surface);
    const existing = byKey.get(key);
    if (existing) {
      merged += 1;
      if (!existing.mentionIds.includes(mention.mentionId)) {
        existing.mentionIds.push(mention.mentionId);
      }
      continue;
    }
    created += 1;
    byKey.set(key, {
      entityId: entityIdFromKey(key),
      typeId,
      label: mention.surface,
      identityValues: mention.identityValues,
      mentionIds: [mention.mentionId],
    });
  }

  return {
    entities: [...byKey.values()],
    merged,
    created,
    rebound,
  };
}
