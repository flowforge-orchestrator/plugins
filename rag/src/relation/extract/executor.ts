import { Allow, IsString, MinLength } from 'class-validator';
import { createHash } from 'crypto';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import type {
  CanonicalEntity,
  EntityRelation,
  OntologySchema,
  RagChunk,
} from '../../contracts/types';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Сущности',
    canBePort: true,
    isPort: true,
    required: true,
  })
  entities!: CanonicalEntity[];

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Чанки',
    canBePort: true,
    isPort: true,
    required: true,
  })
  chunks!: RagChunk[];

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Схема',
    canBePort: true,
    isPort: true,
    required: true,
  })
  schema!: OntologySchema;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID коллекции',
    canBePort: true,
    isPort: true,
    required: true,
  })
  collectionId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ LLM',
    static: true,
    secretKind: 'OPENAI_API_KEY',
    required: true,
  })
  apiKey!: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Связи' })
  relations!: EntityRelation[];

  @FieldDecorator({ type: 'number', label: 'Без доказательства' })
  withoutEvidenceShare!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.relation.extract',
  name: 'RAG: извлечь связи',
  description: 'Извлекает связи между каноническими сущностями по схеме.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagRelationExtractExecutor {
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
    );
    const payload = await services.llm.completeJson<{
      relations?: Array<{
        typeId: string;
        fromLabel?: string;
        toLabel?: string;
        fromEntityId?: string;
        toEntityId?: string;
        chunkId: string;
        evidence?: string;
      }>;
    }>({
      apiKey: ctx.inputs.apiKey,
      systemPrompt:
        'Extract up to 8 relations. Return JSON {"relations":[{"typeId","fromEntityId|fromLabel","toEntityId|toLabel","chunkId","evidence"}]}. Use only provided relationTypes and entities.',
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
    });

    const relations: EntityRelation[] = [];
    let withoutEvidence = 0;
    for (const raw of payload.relations ?? []) {
      if (!allowed.has(raw.typeId)) continue;
      const from =
        (raw.fromEntityId && byId.get(raw.fromEntityId)) ||
        (raw.fromLabel && byLabel.get(raw.fromLabel.trim().toLowerCase()));
      const to =
        (raw.toEntityId && byId.get(raw.toEntityId)) ||
        (raw.toLabel && byLabel.get(raw.toLabel.trim().toLowerCase()));
      if (!from || !to) continue;
      const chunk =
        chunks.find((c) => c.chunkId === raw.chunkId) ??
        chunks[0];
      if (!chunk) continue;
      if (!raw.evidence?.trim()) withoutEvidence += 1;
      const relationId = createHash('sha256')
        .update(
          `${raw.typeId}:${from.entityId}:${to.entityId}:${chunk.chunkId}`,
        )
        .digest('hex')
        .slice(0, 24);
      relations.push({
        relationId,
        typeId: raw.typeId,
        fromEntityId: from.entityId,
        toEntityId: to.entityId,
        chunkId: chunk.chunkId,
        docId: chunk.docId,
        evidence: raw.evidence,
      });
    }
    return {
      relations: toJsonPort(relations) as never,
      withoutEvidenceShare:
        (payload.relations?.length ?? 0) === 0
          ? 0
          : withoutEvidence / (payload.relations?.length ?? 1),
    };
  }
}
