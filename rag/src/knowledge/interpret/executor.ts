import { Allow, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type { Evidence, ObservationBundle } from '../../contracts/knowledge';
import type { RagChunk } from '../../contracts/types';
import { interpretObservations } from './observations.logic';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Evidence',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  evidence!: Evidence;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Чанки',
    canBePort: true,
    isPort: true,
    required: true,
  })
  chunks!: RagChunk[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Сырые кандидаты',
    canBePort: true,
    isPort: true,
  })
  raw?: Record<string, unknown>;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Фрагмент схемы',
    static: true,
  })
  schemaFragment?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    static: true,
  })
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Лимит кандидатов',
    static: true,
    default: 50,
  })
  candidateLimit?: number;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Наблюдения' })
  observations!: ObservationBundle;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.interpret.observations',
  name: 'RAG: интерпретировать наблюдения',
  description: 'Строит пакет наблюдений S1 по Evidence и чанкам.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagInterpretObservationsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    void ctx.inputs.schemaFragment;
    void ctx.inputs.model;
    const result = interpretObservations({
      evidence: fromJsonPort(ctx.inputs.evidence, {
        id: '',
        text: '',
        source: '',
        observedAt: '',
        hash: '',
      }),
      chunks: fromJsonPort(ctx.inputs.chunks, []),
      raw: fromJsonPort(ctx.inputs.raw, undefined),
      candidateLimit: ctx.inputs.candidateLimit,
    });
    return { observations: toJsonPort(result) as never };
  }
}
