import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { getRagServices } from '../adapters/services';
import { toJsonPort } from '../internal/json-port';

class InputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст документа',
    description: 'Сырой текст или Markdown',
    canBePort: true,
    isPort: true,
    isPrimary: true,
  })
  documentText?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'URL документа',
    description: 'HTTP(S) URL с текстом документа',
    canBePort: true,
    isPort: false,
  })
  documentUrl?: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID документа',
    description: 'Стабильный идентификатор документа в коллекции',
    canBePort: true,
    isPort: true,
    required: true,
  })
  docId!: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Блоки',
    description: 'Промежуточные блоки документа',
  })
  /** JSON DocBlock[] — textarea ports mangle nested objects unless stringified. */
  blocks!: string;

  @FieldDecorator({
    type: 'number',
    label: 'Покрытие страниц',
    description: 'Доля страниц с текстом (0..1)',
  })
  pageCoverage!: number;

  @FieldDecorator({
    type: 'number',
    label: 'Число блоков',
  })
  blockCount!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.extract',
  name: 'RAG: извлечь документ',
  description: 'Приводит текст или URL к блокам документа.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagExtractExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { blocks, pageCoverage } = await getRagServices().parser.parse({
      documentText: ctx.inputs.documentText,
      documentUrl: ctx.inputs.documentUrl,
      docId: ctx.inputs.docId,
    });
    return {
      blocks: toJsonPort(blocks),
      pageCoverage,
      blockCount: blocks.length,
    };
  }
}
