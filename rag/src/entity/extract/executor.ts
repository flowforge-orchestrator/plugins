import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import type {
  EntityMention,
  OntologySchema,
  RagChunk,
} from '../../contracts/types';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import { createHash } from 'crypto';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Чанки',
    canBePort: true,
    isPort: true,
    isPrimary: true,
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

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'ID документа',
    canBePort: true,
    isPort: true,
  })
  docId?: string;

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
  @FieldDecorator({ type: 'textarea', label: 'Упоминания' })
  mentions!: EntityMention[];

  @FieldDecorator({ type: 'number', label: 'Вне схемы' })
  outOfSchemaShare!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.entity.extract',
  name: 'RAG: извлечь упоминания',
  description: 'Извлекает упоминания сущностей в закрытую схему.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagEntityExtractExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const schema = fromJsonPort<OntologySchema>(ctx.inputs.schema, {
      version: 0,
      entityTypes: [],
      relationTypes: [],
    });
    const typeIds = new Set(schema.entityTypes.map((t) => t.id));
    const chunks = fromJsonPort<RagChunk[]>(ctx.inputs.chunks, []);
    const sample = chunks
      .slice(0, 4)
      .map((c) => ({
        chunkId: c.chunkId,
        docId: c.docId,
        text: c.text.slice(0, 350),
      }));
    const payload = await services.llm.completeJson<{
      mentions?: Array<{
        surface: string;
        typeId: string;
        chunkId: string;
        identityValues?: Record<string, string>;
      }>;
    }>({
      apiKey: ctx.inputs.apiKey,
      systemPrompt:
        'Extract up to 8 entity mentions. Return JSON {"mentions":[{"surface","typeId","chunkId","identityValues"}]}. typeId must be from schema entityTypes ids only.',
      userPrompt: JSON.stringify(
        {
          entityTypeIds: schema.entityTypes.map((t) => t.id),
          chunks: sample,
        },
        null,
        2,
      ),
    });
    const mentions: EntityMention[] = [];
    let outOfSchema = 0;
    for (const raw of payload.mentions ?? []) {
      if (!typeIds.has(raw.typeId)) {
        outOfSchema += 1;
        continue;
      }
      const chunk = chunks.find((c) => c.chunkId === raw.chunkId) ?? chunks[0];
      if (!chunk) continue;
      const mentionId = createHash('sha256')
        .update(`${chunk.docId}:${raw.chunkId}:${raw.typeId}:${raw.surface}`)
        .digest('hex')
        .slice(0, 24);
      mentions.push({
        mentionId,
        surface: raw.surface,
        typeId: raw.typeId,
        chunkId: chunk.chunkId,
        docId: ctx.inputs.docId ?? chunk.docId,
        identityValues: raw.identityValues,
      });
    }
    const docId = ctx.inputs.docId ?? chunks[0]?.docId;
    if (docId) {
      await services.ontology.replaceMentionsForDoc(
        ctx.inputs.collectionId,
        docId,
        mentions,
      );
    }
    return {
      mentions: toJsonPort(mentions) as never,
      outOfSchemaShare:
        (payload.mentions?.length ?? 0) === 0
          ? 0
          : outOfSchema / (payload.mentions?.length ?? 1),
    };
  }
}
