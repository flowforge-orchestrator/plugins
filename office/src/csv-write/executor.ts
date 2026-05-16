import * as fs from 'fs/promises';
import * as path from 'path';
import { stringify } from 'csv-stringify';
import { IsArray, IsOptional, IsString } from 'class-validator';
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
  @IsArray()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Строки',
    description: 'Массив объектов для записи в csv',
    isPrimary: true,
    isPort: true,
    canBePort: true,
  })
  rows!: Record<string, unknown>[];

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Путь',
    description: 'Путь к csv файлу',
    isPort: true,
    canBePort: true,
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
    type: 'string',
    label: 'Путь',
    description: 'Полный путь к созданному csv файлу',
  })
  path!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'system.office.csv.write',
  name: 'Office: csv write',
  description: 'Записывает массив объектов в csv файл.',
  help,
  pluginId: 'office',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class SystemOfficeCsvWriteExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const base = ctx.inputs.basePath ?? process.env.RUN_WORKSPACE_PATH ?? '';
    const fullPath = resolvePath(base, ctx.inputs.path ?? '');
    const delimiter = (ctx.inputs.delimiter || ',').slice(0, 1) || ',';
    const encoding = (ctx.inputs.encoding || 'utf-8') as BufferEncoding;
    const rows = Array.isArray(ctx.inputs.rows) ? ctx.inputs.rows : [];
    const csv = await new Promise<string>((resolve, reject) => {
      stringify(rows, { header: true, delimiter }, (err, out) => {
        if (err) reject(err);
        else resolve(out);
      });
    });
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, csv, { encoding });
    return { path: fullPath };
  }
}
