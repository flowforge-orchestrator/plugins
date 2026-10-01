#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"


def ensure_import(text: str, import_line: str, after: str) -> str:
    if "from '../../internal/json-port'" in text or 'from "../internal/json-port"' in text:
        return text
    if after not in text:
        raise RuntimeError(f"anchor missing: {after}")
    return text.replace(after, after + "\n" + import_line, 1)


def patch_file(rel: str, *, import_anchor: str, import_line: str, replacements: list[tuple[str, str]]):
    path = ROOT / rel
    text = path.read_text()
    text = ensure_import(text, import_line, import_anchor)
    for old, new in replacements:
        if old not in text:
            raise RuntimeError(f"{rel}: pattern not found:\n{old[:120]}")
        text = text.replace(old, new, 1)
    path.write_text(text)
    print("patched", rel)


patch_file(
    "ontology/propose-entities/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort, toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagOntologyProposeEntitiesExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const stored = await services.ontology.loadSchema(ctx.inputs.collectionId);
    const schema = ctx.inputs.schema ?? stored;
    const sample = (ctx.inputs.chunks ?? [])
      .slice(0, 12)
      .map((c) => ({ headingPath: c.headingPath, text: c.text.slice(0, 500) }));""",
            """export class RagOntologyProposeEntitiesExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const stored = await services.ontology.loadSchema(ctx.inputs.collectionId);
    const schema = fromJsonPort(ctx.inputs.schema, stored) ?? stored;
    const chunks = fromJsonPort<RagChunk[]>(ctx.inputs.chunks, []);
    const sample = chunks
      .slice(0, 12)
      .map((c) => ({ headingPath: c.headingPath, text: c.text.slice(0, 500) }));""",
        ),
        (
            "return { candidateTypes, matchedExisting };",
            "return { candidateTypes: toJsonPort(candidateTypes) as never, matchedExisting };",
        ),
    ],
)

patch_file(
    "ontology/propose-relations/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort, toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagOntologyProposeRelationsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const types = ctx.inputs.candidateTypes ?? [];
    const typeIds = new Set(types.map((t) => t.id));
    const sample = (ctx.inputs.chunks ?? [])
      .slice(0, 12)
      .map((c) => ({ headingPath: c.headingPath, text: c.text.slice(0, 500) }));""",
            """export class RagOntologyProposeRelationsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const types = fromJsonPort<EntityTypeDecl[]>(ctx.inputs.candidateTypes, []);
    const typeIds = new Set(types.map((t) => t.id));
    const chunks = fromJsonPort<RagChunk[]>(ctx.inputs.chunks, []);
    const sample = chunks
      .slice(0, 12)
      .map((c) => ({ headingPath: c.headingPath, text: c.text.slice(0, 500) }));""",
        ),
        (
            "return { candidateRelations, rejectedDomainRange };",
            "return { candidateRelations: toJsonPort(candidateRelations) as never, rejectedDomainRange };",
        ),
    ],
)

patch_file(
    "ontology/merge/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort, toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagOntologyMergeExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const current =
      ctx.inputs.schema ??
      (await services.ontology.loadSchema(ctx.inputs.collectionId));
    const { schema, delta } = mergeOntologySchema({
      current,
      candidateTypes: ctx.inputs.candidateTypes ?? [],
      candidateRelations: ctx.inputs.candidateRelations ?? [],
    });
    await services.ontology.saveSchema(ctx.inputs.collectionId, schema);
    return {
      schema,
      delta,
      schemaVersion: schema.version,
      operationCount: delta.operations.length,
    };
  }
}""",
            """export class RagOntologyMergeExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const loaded = await services.ontology.loadSchema(ctx.inputs.collectionId);
    const current =
      fromJsonPort<OntologySchema | undefined>(ctx.inputs.schema, undefined) ??
      loaded;
    const { schema, delta } = mergeOntologySchema({
      current,
      candidateTypes: fromJsonPort<EntityTypeDecl[]>(ctx.inputs.candidateTypes, []),
      candidateRelations: fromJsonPort<RelationTypeDecl[]>(
        ctx.inputs.candidateRelations,
        [],
      ),
    });
    await services.ontology.saveSchema(ctx.inputs.collectionId, schema);
    return {
      schema: toJsonPort(schema) as never,
      delta: toJsonPort(delta) as never,
      schemaVersion: schema.version,
      operationCount: delta.operations.length,
    };
  }
}""",
        ),
    ],
)

# entity extract — fix imports first
ent = ROOT / "entity/extract/executor.ts"
et = ent.read_text()
if "OntologySchema" not in et:
    et = et.replace(
        "import type { EntityMention } from '../../contracts/types';",
        "import type { EntityMention, OntologySchema, RagChunk } from '../../contracts/types';",
    )
    ent.write_text(et)

patch_file(
    "entity/extract/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort, toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagEntityExtractExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const schema = ctx.inputs.schema;
    const typeIds = new Set(schema.entityTypes.map((t) => t.id));
    const chunks = ctx.inputs.chunks ?? [];
    const sample = (ctx.inputs.chunks ?? [])""",
            """export class RagEntityExtractExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const schema = fromJsonPort<OntologySchema>(ctx.inputs.schema, {
      version: 0,
      entityTypes: [],
      relationTypes: [],
    });
    const typeIds = new Set(schema.entityTypes.map((t) => t.id));
    const chunks = fromJsonPort<RagChunk[]>(ctx.inputs.chunks, []);
    const sample = chunks""",
        ),
        (
            """    return {
      mentions,
      outOfSchemaShare:
        (payload.mentions?.length ?? 0) === 0
          ? 0
          : outOfSchema / (payload.mentions?.length ?? 1),
    };
  }
}""",
            """    return {
      mentions: toJsonPort(mentions) as never,
      outOfSchemaShare:
        (payload.mentions?.length ?? 0) === 0
          ? 0
          : outOfSchema / (payload.mentions?.length ?? 1),
    };
  }
}""",
        ),
    ],
)

patch_file(
    "entity/resolve/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort, toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagEntityResolveExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const existing = await services.ontology.listEntities(
      ctx.inputs.collectionId,
    );
    const result = resolveEntities({
      mentions: ctx.inputs.mentions ?? [],
      existing,
      delta: ctx.inputs.delta,
    });
    await services.ontology.saveEntities(
      ctx.inputs.collectionId,
      result.entities,
    );
    return result;
  }
}""",
            """export class RagEntityResolveExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const existing = await services.ontology.listEntities(
      ctx.inputs.collectionId,
    );
    const result = resolveEntities({
      mentions: fromJsonPort(ctx.inputs.mentions, []),
      existing,
      delta: fromJsonPort(ctx.inputs.delta, undefined),
    });
    await services.ontology.saveEntities(
      ctx.inputs.collectionId,
      result.entities,
    );
    return {
      ...result,
      entities: toJsonPort(result.entities) as never,
    };
  }
}""",
        ),
    ],
)

# relation extract imports
rel = ROOT / "relation/extract/executor.ts"
rt = rel.read_text()
if "RagChunk" not in rt.split("from '../../contracts/types'")[0]:
    # already has types - check
    pass

patch_file(
    "relation/extract/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort, toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagRelationExtractExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const entities = ctx.inputs.entities ?? [];
    const byId = new Map(entities.map((e) => [e.entityId, e]));
    const byLabel = new Map(
      entities.map((e) => [e.label.trim().toLowerCase(), e]),
    );
    const allowed = new Set(
      ctx.inputs.schema.relationTypes.map((r) => r.id),
    );""",
            """export class RagRelationExtractExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const entities = fromJsonPort(ctx.inputs.entities, [] as typeof ctx.inputs.entities);
    const schema = fromJsonPort(ctx.inputs.schema, ctx.inputs.schema);
    const chunks = fromJsonPort(ctx.inputs.chunks, [] as NonNullable<typeof ctx.inputs.chunks>);
    const byId = new Map(entities.map((e) => [e.entityId, e]));
    const byLabel = new Map(
      entities.map((e) => [e.label.trim().toLowerCase(), e]),
    );
    const allowed = new Set(
      schema.relationTypes.map((r) => r.id),
    );""",
        ),
        (
            """        'Extract up to 8 relations. Return JSON {"relations":[{"typeId","fromEntityId|fromLabel","toEntityId|toLabel","chunkId","evidence"}]}. Use only provided relationTypes and entities.',
      userPrompt: JSON.stringify(
        {
          relationTypeIds: ctx.inputs.schema.relationTypes.map((r) => r.id),
          entities: entities.slice(0, 12).map((e) => ({
            entityId: e.entityId,
            typeId: e.typeId,
            label: e.label,
          })),
          chunks: (ctx.inputs.chunks ?? []).slice(0, 4).map((c) => ({
            chunkId: c.chunkId,
            docId: c.docId,
            text: c.text.slice(0, 350),
          })),
        },
        null,
        2,
      ),
    });""",
            """        'Extract up to 8 relations. Return JSON {"relations":[{"typeId","fromEntityId|fromLabel","toEntityId|toLabel","chunkId","evidence"}]}. Use only provided relationTypes and entities.',
      userPrompt: JSON.stringify(
        {
          relationTypeIds: schema.relationTypes.map((r) => r.id),
          entities: entities.slice(0, 12).map((e) => ({
            entityId: e.entityId,
            typeId: e.typeId,
            label: e.label,
          })),
          chunks: chunks.slice(0, 4).map((c) => ({
            chunkId: c.chunkId,
            docId: c.docId,
            text: c.text.slice(0, 350),
          })),
        },
        null,
        2,
      ),
    });""",
        ),
        (
            """      const chunk =
        (ctx.inputs.chunks ?? []).find((c) => c.chunkId === raw.chunkId) ??
        ctx.inputs.chunks?.[0];""",
            """      const chunk =
        chunks.find((c) => c.chunkId === raw.chunkId) ??
        chunks[0];""",
        ),
        (
            """    return {
      relations,
      withoutEvidenceShare:
        (payload.relations?.length ?? 0) === 0
          ? 0
          : withoutEvidence / (payload.relations?.length ?? 1),
    };
  }
}""",
            """    return {
      relations: toJsonPort(relations) as never,
      withoutEvidenceShare:
        (payload.relations?.length ?? 0) === 0
          ? 0
          : withoutEvidence / (payload.relations?.length ?? 1),
    };
  }
}""",
        ),
    ],
)

patch_file(
    "index/write/executor.ts",
    import_anchor="} from '../../contracts/types';",
    import_line="import { fromJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            """export class RagIndexWriteExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const chunks = ctx.inputs.chunks ?? [];
    const embedded = await services.embedder.embed(
      chunks.map((c) => c.text),
      ctx.inputs.embeddingApiKey,
    );
    const vectorStats = await services.vectors.upsertChunks({
      collectionId: ctx.inputs.collectionId,
      docId: ctx.inputs.docId,
      chunks,
      vectors: embedded.vectors,
    });
    const graphStats = await services.graph.upsertGraph({
      collectionId: ctx.inputs.collectionId,
      docId: ctx.inputs.docId,
      schema: ctx.inputs.schema,
      entities: ctx.inputs.entities ?? [],
      relations: ctx.inputs.relations ?? [],
      chunks,
    });
    await services.ontology.saveSchema(
      ctx.inputs.collectionId,
      ctx.inputs.schema,
    );""",
            """export class RagIndexWriteExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const chunks = fromJsonPort(ctx.inputs.chunks, [] as NonNullable<typeof ctx.inputs.chunks>);
    const schema = fromJsonPort(ctx.inputs.schema, ctx.inputs.schema);
    const entities = fromJsonPort(ctx.inputs.entities, [] as NonNullable<typeof ctx.inputs.entities>);
    const relations = fromJsonPort(ctx.inputs.relations, [] as NonNullable<typeof ctx.inputs.relations>);
    const embedded = await services.embedder.embed(
      chunks.map((c) => c.text),
      ctx.inputs.embeddingApiKey,
    );
    const vectorStats = await services.vectors.upsertChunks({
      collectionId: ctx.inputs.collectionId,
      docId: ctx.inputs.docId,
      chunks,
      vectors: embedded.vectors,
    });
    const graphStats = await services.graph.upsertGraph({
      collectionId: ctx.inputs.collectionId,
      docId: ctx.inputs.docId,
      schema,
      entities,
      relations,
      chunks,
    });
    await services.ontology.saveSchema(
      ctx.inputs.collectionId,
      schema,
    );""",
        ),
        (
            "schemaVersion: ctx.inputs.schema.version,",
            "schemaVersion: schema.version,",
        ),
    ],
)

patch_file(
    "search/query/executor.ts",
    import_anchor="import { assembleContext, fuseHits } from './search.logic';",
    import_line="import { toJsonPort } from '../../internal/json-port';",
    replacements=[
        (
            "return { hits, context, hitCount: hits.length };",
            "return { hits: toJsonPort(hits) as never, context, hitCount: hits.length };",
        ),
    ],
)

print("all done")
