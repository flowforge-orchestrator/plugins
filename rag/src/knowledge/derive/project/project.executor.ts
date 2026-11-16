import { Allow, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import { fromJsonPort } from '../../../internal/json-port';
import { deriveProject, type ProjectionKind } from './project.logic';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'ID',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  affectedIds!: string[];

  @IsOptional()
  @IsIn(['embeddings', 'neighborhood', 'all'])
  @FieldDecorator({
    type: 'select',
    label: 'Проекция',
    description: 'embeddings | neighborhood | all',
    static: true,
    default: 'all',
  })
  projection?: ProjectionKind;
}

class OutputDto {
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Проекция' })
  projection!: string;

  @IsInt()
  @FieldDecorator({ type: 'number', label: 'Запрошено' })
  requested!: number;

  @IsInt()
  @FieldDecorator({ type: 'number', label: 'Спроецировано' })
  projected!: number;

  @IsInt()
  @FieldDecorator({ type: 'number', label: 'Пропущено' })
  skipped!: number;

  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'Успех' })
  ok!: boolean;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Ошибка' })
  error?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.derive.project',
  name: 'RAG: спроецировать S3',
  description: 'Счётчики проекции S3 по затронутым id; сбой не откатывает S2.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagDeriveProjectExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return deriveProject({
      affectedIds: fromJsonPort(ctx.inputs.affectedIds, []),
      projection: ctx.inputs.projection,
    });
  }
}
