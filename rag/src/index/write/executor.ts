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
import { fromJsonPort } from '../../internal/json-port';

class InputDto {
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
    label: 'Сущности',
    canBePort: true,
    isPort: true,
    required: true,
  })
  entities!: CanonicalEntity[];

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Связи',
    canBePort: true,
    isPort: true,
    required: true,
  })
  relations!: EntityRelation[];

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
    isPrimary: true,
    required: true,
  })
  collectionId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID документа',
    canBePort: true,
    isPort: true,
    required: true,
  })
  docId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ эмбеддингов',
    static: true,
    secretKind: 'OPENAI_API_KEY',
    required: true,
  })
  embeddingApiKey!: string;
}

class OutputDto {
  @FieldDecorator({ type: 'number', label: 'Записано векторов' })
  vectorsWritten!: number;

  @FieldDecorator({ type: 'number', label: 'Обновлено векторов' })
  vectorsUpdated!: number;

  @FieldDecorator({ type: 'number', label: 'Удалено сирот' })
  orphansRemoved!: number;

  @FieldDecorator({ type: 'number', label: 'Сущностей в графе' })
  entitiesWritten!: number;

  @FieldDecorator({ type: 'number', label: 'Связей в графе' })
  relationsWritten!: number;

  @FieldDecorator({ type: 'number', label: 'Версия схемы' })
  schemaVersion!: number;

  @FieldDecorator({ type: 'string', label: 'Модель эмбеддинга' })
  embeddingModel!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.index.write',
  name: 'RAG: записать индекс',
  description: 'Пишет чанки в векторный индекс и сущности/связи в граф знаний.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagIndexWriteExecutor {
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
    );
    return {
      vectorsWritten: vectorStats.written,
      vectorsUpdated: vectorStats.updated,
      orphansRemoved: vectorStats.orphansRemoved,
      entitiesWritten: graphStats.entitiesWritten,
      relationsWritten: graphStats.relationsWritten,
      schemaVersion: schema.version,
      embeddingModel: embedded.model,
    };
  }
}
