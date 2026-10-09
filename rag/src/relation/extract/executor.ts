import { Allow, IsString, MinLength } from 'class-validator';
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
import { batchLeafChunks, materializeSpoRelations, type SpoTriple } from '../../spo/spo.logic';
import {
  createSynonymDictionary,
  DEFAULT_NARRATIVE_SYNONYMS,
} from '../../spo/synonym.logic';

const BATCH_SIZE = 4;

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
  description:
    'Per-chunk SPO (Subject/Predicate/Object); predicate → typeId через словарь синонимов.',
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
    const entities = fromJsonPort(
      ctx.inputs.entities,
      [] as typeof ctx.inputs.entities,
    );
    const schema = fromJsonPort(ctx.inputs.schema, ctx.inputs.schema);
    const chunks = fromJsonPort(
      ctx.inputs.chunks,
      [] as NonNullable<typeof ctx.inputs.chunks>,
    );
    const allowed = schema.relationTypes.map((r) => r.id);
    const dict = createSynonymDictionary({
      entities: [
        ...DEFAULT_NARRATIVE_SYNONYMS.entities,
        ...entities.map((e) => ({
          canonical: e.label,
          aliases: e.aliases ?? [],
        })),
      ],
      predicates: [
        ...DEFAULT_NARRATIVE_SYNONYMS.predicates,
        ...allowed.map((typeId) => ({ typeId, aliases: [] as string[] })),
      ],
    });

    const batches = batchLeafChunks(chunks, BATCH_SIZE);
    const triples: SpoTriple[] = [];
    let withoutEvidence = 0;
    let rawTotal = 0;

    for (const batch of batches) {
      const payload = await services.llm.completeJson<{
        triples?: Array<{
          subject: string;
          predicate: string;
          object: string;
          chunkId: string;
          evidence?: string;
        }>;
      }>({
        apiKey: ctx.inputs.apiKey,
        systemPrompt:
          'For EACH chunk extract ALL factual Subject-Predicate-Object triples grounded in the text. Return JSON {"triples":[{"subject","predicate","object","chunkId","evidence"}]}. Prefer relationTypeIds when predicate matches; otherwise use a short verb phrase as predicate. subject/object should be entity surfaces from the chunk.',
        userPrompt: JSON.stringify(
          {
            relationTypeIds: allowed,
            entities: entities.map((e) => ({
              entityId: e.entityId,
              typeId: e.typeId,
              label: e.label,
              aliases: e.aliases ?? [],
            })),
            chunks: batch.map((c) => ({
              chunkId: c.chunkId,
              docId: c.docId,
              text: c.text.slice(0, 500),
            })),
          },
          null,
          2,
        ),
      });

      for (const raw of payload.triples ?? []) {
        rawTotal += 1;
        const chunk =
          batch.find((c) => c.chunkId === raw.chunkId) ?? batch[0];
        if (!chunk) continue;
        if (!raw.evidence?.trim()) withoutEvidence += 1;
        triples.push({
          subject: raw.subject,
          predicate: raw.predicate,
          object: raw.object,
          chunkId: chunk.chunkId,
          docId: chunk.docId,
          evidence: raw.evidence,
        });
      }
    }

    const relations = materializeSpoRelations({
      triples,
      entities,
      allowedRelationTypeIds: allowed,
      dict,
    });

    return {
      relations: toJsonPort(relations) as never,
      withoutEvidenceShare: rawTotal === 0 ? 0 : withoutEvidence / rawTotal,
    };
  }
}
