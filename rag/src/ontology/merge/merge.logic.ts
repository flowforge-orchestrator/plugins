import {
  emptySchema,
  type EntityTypeDecl,
  type OntologySchema,
  type RelationTypeDecl,
  type SchemaDelta,
  type SchemaDeltaOp,
} from '../../contracts/types';

function norm(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, '_');
}

export function mergeOntologySchema(input: {
  current: OntologySchema | null | undefined;
  candidateTypes: EntityTypeDecl[];
  candidateRelations: RelationTypeDecl[];
}): { schema: OntologySchema; delta: SchemaDelta } {
  const current = input.current ?? emptySchema();
  const operations: SchemaDeltaOp[] = [];
  const entityByNorm = new Map(
    current.entityTypes.map((t) => [norm(t.id), t] as const),
  );
  const relationByNorm = new Map(
    current.relationTypes.map((t) => [norm(t.id), t] as const),
  );
  const nextEntities = [...current.entityTypes];
  const nextRelations = [...current.relationTypes];

  for (const candidate of input.candidateTypes) {
    const key = norm(candidate.id);
    const existing = entityByNorm.get(key);
    if (existing) {
      if (existing.id !== candidate.id) {
        operations.push({
          op: 'ALIAS',
          kind: 'entity',
          fromId: candidate.id,
          toId: existing.id,
        });
      }
      continue;
    }
    const fuzzy = [...entityByNorm.values()].find(
      (e) =>
        norm(e.id) === key ||
        (e.description &&
          candidate.description &&
          norm(e.description) === norm(candidate.description)),
    );
    if (fuzzy) {
      operations.push({
        op: 'ALIAS',
        kind: 'entity',
        fromId: candidate.id,
        toId: fuzzy.id,
      });
      continue;
    }
    nextEntities.push(candidate);
    entityByNorm.set(key, candidate);
    operations.push({
      op: 'ADD',
      kind: 'entity',
      id: candidate.id,
      payload: candidate,
    });
  }

  const knownEntityIds = new Set(nextEntities.map((e) => e.id));
  for (const candidate of input.candidateRelations) {
    const key = norm(candidate.id);
    if (relationByNorm.has(key)) continue;
    const fromOk = candidate.from.every((id) => knownEntityIds.has(id));
    const toOk = candidate.to.every((id) => knownEntityIds.has(id));
    if (!fromOk || !toOk) continue;
    nextRelations.push(candidate);
    relationByNorm.set(key, candidate);
    operations.push({
      op: 'ADD',
      kind: 'relation',
      id: candidate.id,
      payload: candidate,
    });
  }

  const toVersion =
    operations.length === 0 ? current.version : current.version + 1;
  const schema: OntologySchema = {
    version: toVersion,
    entityTypes: nextEntities,
    relationTypes: nextRelations,
  };
  return {
    schema,
    delta: {
      fromVersion: current.version,
      toVersion,
      operations,
    },
  };
}
