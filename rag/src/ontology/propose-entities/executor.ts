import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import {
  emptySchema,
  type EntityTypeDecl,
  type OntologySchema,
  type RagChunk,
} from '../../contracts/types';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';

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

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Текущая схема',
    canBePort: true,
    isPort: true,
  })
  schema?: OntologySchema;

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
  @FieldDecorator({ type: 'textarea', label: 'Кандидаты типов' })
  candidateTypes!: EntityTypeDecl[];

  @FieldDecorator({ type: 'number', label: 'Совпало со схемой' })
  matchedExisting!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.ontology.propose.entities',
  name: 'RAG: предложить типы сущностей',
  description: 'LLM предлагает типы сущностей по чанкам и текущей схеме.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagOntologyProposeEntitiesExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const stored = await services.ontology.loadSchema(ctx.inputs.collectionId);
    const schema = fromJsonPort(ctx.inputs.schema, stored) ?? stored;
    const chunks = fromJsonPort<RagChunk[]>(ctx.inputs.chunks, []);
    const sample = chunks
      .slice(0, 12)
      .map((c) => ({ headingPath: c.headingPath, text: c.text.slice(0, 500) }));
    const payload = await services.llm.completeJson<{
      entityTypes?: EntityTypeDecl[];
    }>({
      apiKey: ctx.inputs.apiKey,
      systemPrompt:
        'Propose ontology entity types for a document collection. Return JSON {"entityTypes":[{"id","parent","description","identity"}]}. Prefer existing schema ids when possible.',
      userPrompt: JSON.stringify({ schema, sample }, null, 2),
    });
    const candidateTypes = payload.entityTypes ?? [];
    const existing = new Set(
      (schema.entityTypes ?? emptySchema().entityTypes).map((t) =>
        t.id.toLowerCase(),
      ),
    );
    const matchedExisting = candidateTypes.filter((t) =>
      existing.has(t.id.toLowerCase()),
    ).length;
    return { candidateTypes: toJsonPort(candidateTypes) as never, matchedExisting };
  }
}
