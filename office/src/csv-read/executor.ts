import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse';
import { IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
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
    description: 'Путь к csv файлу',
    isPort: true,
    canBePort: true,
    isPrimary: true,
  })
  path!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Разделитель',
    description: 'Символ разделителя',
    default: ',',
    static: true,
  })
  delimiter?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Кодировка',
    description: 'Кодировка файла',
    default: 'utf-8',
    static: true,
  })
  encoding?: string;

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
    type: 'keyvalue',
    label: 'Строки',
    description: 'Массив строк в виде объектов',
  })
  rows!: Record<string, unknown>[];
}

@Executor<InputDto, OutputDto>({
  nodeType: 'system.office.csv.read',
  name: 'Office: csv read',
  description: 'Читает csv файл и возвращает строки в виде объектов.',
  help,
  pluginId: 'office',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class SystemOfficeCsvReadExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const base = ctx.inputs.basePath ?? process.env.RUN_WORKSPACE_PATH ?? '';
    const fullPath = resolvePath(base, ctx.inputs.path ?? '');
    const encoding = (ctx.inputs.encoding || 'utf-8') as BufferEncoding;
    const delimiter = (ctx.inputs.delimiter || ',').slice(0, 1) || ',';
    const content = await fs.readFile(fullPath, { encoding });
    const rows = await new Promise<Record<string, unknown>[]>(
      (resolve, reject) => {
        parse(
          content,
          {
            columns: true,
            skip_empty_lines: true,
            delimiter,
            trim: true,
          },
          (err, data) => {
            if (err) reject(err);
            else resolve((data ?? []) as Record<string, unknown>[]);
          },
        );
      },
    );
    return { rows };
  }
}
