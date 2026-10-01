import {
  Allow,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { getRagServices } from '../adapters/services';
import { fromJsonPort, toJsonPort } from '../internal/json-port';
import type { DocBlock } from '../contracts/types';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Блоки',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  blocks!: string | DocBlock[];

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

  @IsIn(['recursive', 'semantic'])
  @FieldDecorator({
    type: 'select',
    label: 'Стратегия',
    description: 'recursive | semantic',
    static: true,
    default: 'recursive',
  })
  strategy!: 'recursive' | 'semantic';

  @IsInt()
  @Min(32)
  @FieldDecorator({
    type: 'number',
    label: 'Макс. токенов',
    static: true,
    default: 400,
  })
  maxTokens!: number;

  @IsInt()
  @Min(0)
  @FieldDecorator({
    type: 'number',
    label: 'Overlap токенов',
    static: true,
    default: 40,
  })
  overlapTokens!: number;

  @IsOptional()
  @IsInt()
  @Min(32)
  @FieldDecorator({
    type: 'number',
    label: 'Жёсткий потолок',
    static: true,
  })
  hardMaxTokens?: number;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Чанки' })
  chunks!: string;

  @Allow()
  @FieldDecorator({ type: 'keyvalue', label: 'Гистограмма длин' })
  lengthHistogram!: Record<string, number>;

  @FieldDecorator({ type: 'number', label: 'Доля пустых' })
  emptyShare!: number;

  @FieldDecorator({ type: 'number', label: 'Доля вынужденных разрезов' })
  forcedCutShare!: number;

  @FieldDecorator({ type: 'number', label: 'Число чанков' })
  chunkCount!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.chunk',
  name: 'RAG: нарезать чанки',
  description: 'Структурная нарезка блоков в чанки с overlap и parentId.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagChunkExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const blocks = fromJsonPort<DocBlock[]>(ctx.inputs.blocks, []);
    const result = getRagServices().chunker.chunk({
      blocks,
      docId: ctx.inputs.docId,
      strategy: ctx.inputs.strategy ?? 'recursive',
      maxTokens: Number(ctx.inputs.maxTokens ?? 400),
      overlapTokens: Number(ctx.inputs.overlapTokens ?? 40),
      hardMaxTokens: ctx.inputs.hardMaxTokens,
    });
    return {
      chunks: toJsonPort(result.chunks),
      lengthHistogram: result.lengthHistogram,
      emptyShare: result.emptyShare,
      forcedCutShare: result.forcedCutShare,
      chunkCount: result.chunks.length,
    };
  }
}
