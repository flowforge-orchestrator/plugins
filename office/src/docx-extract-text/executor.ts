import * as fs from 'fs/promises';
import * as path from 'path';
import * as mammoth from 'mammoth';
import { IsOptional, IsString } from 'class-validator';
import { ExecContext, Executor, FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import help from './help.md';

function resolvePath(basePath: string, relativePath: string): string {
  const base = path.resolve(basePath || process.cwd());
  const resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal not allowed: ${relativePath}`);
  }
  return resolved;
}

class InputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Путь',
    description: 'Путь к docx файлу',
    isPort: true,
    canBePort: true,
    isPrimary: true,
  })
  path!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Базовая папка',
    description: 'Базовая директория',
    default: '',
    static: true,
  })
  basePath?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'string',
    label: 'Текст',
    description: 'Извлеченный текст документа',
  })
  text!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'system.office.docx.extractText',
  name: 'Office: docx extract text',
  description: 'Извлекает текст из docx документа.',
  help,
  pluginId: 'office',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class SystemOfficeDocxExtractTextExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const base = ctx.inputs.basePath ?? process.env.RUN_WORKSPACE_PATH ?? '';
    const fullPath = resolvePath(base, ctx.inputs.path ?? '');
    await fs.access(fullPath);
    const result = await mammoth.extractRawText({ path: fullPath });
    return { text: result.value || '' };
  }
}
