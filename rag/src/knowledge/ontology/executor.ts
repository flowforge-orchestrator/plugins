import { Allow, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type {
  OntologyEvolveDecision,
  OntologyEvolveLogEntry,
} from '../../contracts/knowledge';
import { evolveOntology } from './evolve.logic';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Решение',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  decision!: OntologyEvolveDecision;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Evidence ID',
    canBePort: true,
    isPort: true,
  })
  evidenceId?: string;

  @IsInt()
  @Min(0)
  @FieldDecorator({
    type: 'number',
    label: 'Текущая версия',
    canBePort: true,
    isPort: true,
    required: true,
  })
  currentSchemaVersion!: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Утверждено',
    canBePort: true,
    isPort: true,
  })
  assertedAt?: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Запись журнала' })
  entry!: OntologyEvolveLogEntry;

  @IsInt()
  @FieldDecorator({ type: 'number', label: 'Версия схемы' })
  schemaVersion!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.ontology.evolve',
  name: 'RAG: эволюция онтологии',
  description: 'Пишет журнал эволюции схемы и увеличивает schemaVersion.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagOntologyEvolveExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const result = evolveOntology({
      decision: fromJsonPort(ctx.inputs.decision, { op: 'ADD', kind: 'concept' }),
      evidenceId: ctx.inputs.evidenceId,
      currentSchemaVersion: Number(ctx.inputs.currentSchemaVersion ?? 0),
      assertedAt: ctx.inputs.assertedAt,
    });
    return {
      entry: toJsonPort(result.entry) as never,
      schemaVersion: result.schemaVersion,
    };
  }
}
