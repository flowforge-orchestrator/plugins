import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from './getUrlFromEnv';
import { applyDocumentRules } from './document-rules.logic';

const help = readFileSync(join(__dirname, 'help.md'), 'utf8');

type FileInput = Buffer | { type: 'Buffer'; data: number[] } | string;

class InputDto {
  @IsOptional()
  @FieldDecorator({
    type: 'file',
    label: 'Файл',
    description: 'Загруженный документ. Содержимое подставляет рантайм.',
    isPort: true,
    canBePort: true,
    isPrimary: true,
  })
  file?: FileInput;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст',
    description: 'Текст документа, если файл уже прочитан как текст.',
    isPort: true,
    canBePort: true,
  })
  text?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Имя файла',
    description: 'Исходное имя. Пусто: document.txt.',
    isPort: true,
    canBePort: true,
  })
  filename?: string;
}

class FileOutputDto {
  @IsString()
  filename!: string;

  @IsString()
  content!: string;
}

class OutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Имя файла',
    description: 'Имя нового файла для скачивания.',
  })
  filename!: string;

  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст',
    description: 'Текст нового файла после зафиксированных правил.',
  })
  content!: string;

  @FieldDecorator({
    type: 'keyvalue',
    label: 'Файл',
    description: 'Новый файл: имя и текст.',
  })
  file!: FileOutputDto;
}

function toBuffer(value: FileInput): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (
    value &&
    typeof value === 'object' &&
    value.type === 'Buffer' &&
    Array.isArray(value.data)
  ) {
    return Buffer.from(value.data);
  }
  return Buffer.from(String(value), 'utf8');
}

export function documentBytes(inputs: {
  file?: FileInput;
  text?: string;
}): Buffer {
  if (inputs.file != null) return toBuffer(inputs.file);
  if (typeof inputs.text === 'string') return Buffer.from(inputs.text, 'utf8');
  throw new Error('Файл не передан');
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.document-rules.apply',
  name: 'Обработка документа',
  description:
    'Принимает файл и отдаёт новый текстовый файл по зафиксированным правилам.',
  help,
  pluginId: 'document-rules',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class DocumentRulesExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const processed = applyDocumentRules(
      documentBytes(ctx.inputs),
      ctx.inputs.filename,
    );
    const content = processed.bytes.toString('utf8');
    return {
      filename: processed.filename,
      content,
      file: {
        filename: processed.filename,
        content,
      },
    };
  }
}
