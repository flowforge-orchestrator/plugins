import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { mergeOntologySchema } from './merge.logic';
import type {
  EntityTypeDecl,
  OntologySchema,
  RelationTypeDecl,
  SchemaDelta,
} from '../../contracts/types';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';

class InputDto {
  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Текущая схема',
    canBePort: true,
    isPort: true,
  })
  schema?: OntologySchema;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Кандидаты типов',
    canBePort: true,
    isPort: true,
    required: true,
  })
  candidateTypes!: EntityTypeDecl[];

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Кандидаты связей',
    canBePort: true,
    isPort: true,
    required: true,
  })
  candidateRelations!: RelationTypeDecl[];

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
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Схема' })
  schema!: OntologySchema;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Дельта' })
  delta!: SchemaDelta;

  @FieldDecorator({ type: 'number', label: 'Версия схемы' })
  schemaVersion!: number;

  @FieldDecorator({ type: 'number', label: 'Число операций' })
  operationCount!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.ontology.merge',
  name: 'RAG: слить онтологию',
  description: 'Сливает кандидатов с текущей схемой коллекции и сохраняет версию.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagOntologyMergeExecutor {
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
}
