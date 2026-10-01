import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { resolveEntities } from './resolve.logic';
import type {
  CanonicalEntity,
  EntityMention,
  SchemaDelta,
} from '../../contracts/types';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Упоминания',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  mentions!: EntityMention[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Дельта схемы',
    canBePort: true,
    isPort: true,
  })
  delta?: SchemaDelta;

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
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Сущности' })
  entities!: CanonicalEntity[];

  @FieldDecorator({ type: 'number', label: 'Склеено' })
  merged!: number;

  @FieldDecorator({ type: 'number', label: 'Создано' })
  created!: number;

  @FieldDecorator({ type: 'number', label: 'Перепривязано' })
  rebound!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.entity.resolve',
  name: 'RAG: разрешить сущности',
  description: 'Склеивает упоминания в канонические сущности и перепривязывает по дельте.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagEntityResolveExecutor {
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
}
