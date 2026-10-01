import type {
  CanonicalEntity,
  OntologySchema,
} from '../../contracts/types';

/** Entities whose label or type contains the whole query, case-insensitively. */
export function buildOntologyContext(input: {
  schema: OntologySchema;
  entities: CanonicalEntity[];
  query: string;
  maxEntities?: number;
}): { ontologyContext: string; matchedEntityIds: string[] } {
  const needle = input.query.trim().toLowerCase();
  const maxEntities = input.maxEntities ?? 20;
  const typeLines = input.schema.entityTypes.slice(0, 24).map((t) => {
    const desc = t.description ? ` — ${t.description}` : '';
    return `- ${t.id}${desc}`;
  });

  const matched = needle
    ? input.entities.filter((e) =>
        `${e.label} ${e.typeId}`.toLowerCase().includes(needle),
      )
    : input.entities.slice(0, maxEntities);

  const entityLines = matched.slice(0, maxEntities).map((e) => {
    return `- [${e.typeId}] ${e.label}`;
  });

  const parts = [
    'Entity types:',
    typeLines.join('\n') || '(none)',
    'Matched entities:',
    entityLines.join('\n') || '(none)',
  ];
  return {
    ontologyContext: parts.join('\n').slice(0, 8000),
    matchedEntityIds: matched.slice(0, maxEntities).map((e) => e.entityId),
  };
}
