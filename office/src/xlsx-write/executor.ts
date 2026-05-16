import * as fs from 'fs/promises';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  @IsArray()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Строки',
    description: 'Массив объектов для записи в Excel',
    isPort: true,
    canBePort: true,
    isPrimary: true,
  })
  rows!: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Путь',
    description: 'Путь к выходному xlsx файлу. Пусто — только base64 в выходе.',
    isPort: true,
    canBePort: true,
  })
  path?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Лист',
    description: 'Имя листа',
    default: 'Sheet1',
    static: true,
  })
  sheetName?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Колонки',
    description: 'Колонки через запятую. Пусто — все поля',
    default: '',
    static: true,
  })
  columns?: string;

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

class FileOutputDto {
  @IsString()
  filename!: string;

  @IsString()
  base64!: string;
}

class OutputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Путь',
    description: 'Полный путь к созданному xlsx файлу (если задан path)',
  })
  path!: string;

  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Количество строк',
    description: 'Сколько строк записано',
  })
  rowCount!: number;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Base64',
    description:
      'Содержимое xlsx в base64 — для write-binary или вложений email',
  })
  base64!: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Имя файла',
    description: 'Рекомендуемое имя для вложения (например report.xlsx)',
  })
  suggestedFilename!: string;

  @ValidateNested()
  @Type(() => FileOutputDto)
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Файл',
    description: 'Объект файла { filename, base64 } для дальнейшей передачи',
  })
  file!: { filename: string; base64: string };
}

function pickColumns(
  rows: Record<string, unknown>[],
  columnsCsv?: string,
): Record<string, unknown>[] {
  const cols = (columnsCsv ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (cols.length === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of cols) out[col] = row[col];
    return out;
  });
}

@Executor<InputDto, OutputDto>({
  nodeType: 'system.office.xlsx.write',
  name: 'Office: xlsx write',
  description: 'Записывает массив объектов в xlsx файл.',
  help,
  pluginId: 'office',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class SystemOfficeXlsxWriteExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const base = ctx.inputs.basePath ?? process.env.RUN_WORKSPACE_PATH ?? '';
    const outPath = ctx.inputs.path?.trim();
    const rows = Array.isArray(ctx.inputs.rows) ? ctx.inputs.rows : [];
    const selected = pickColumns(rows, ctx.inputs.columns);
    const sheetName = ctx.inputs.sheetName?.trim() || 'Sheet1';
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(selected);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const bufferRaw: unknown = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx',
    });
    const buffer: Buffer = Buffer.isBuffer(bufferRaw)
      ? bufferRaw
      : Buffer.from(bufferRaw as ArrayBuffer);
    const base64 = buffer.toString('base64');
    const suggestedFilename =
      outPath && path.basename(outPath).toLowerCase().endsWith('.xlsx')
        ? path.basename(outPath)
        : 'report.xlsx';
    let fullPath = '';
    if (outPath) {
      fullPath = resolvePath(base, outPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
    }
    return {
      path: fullPath,
      rowCount: selected.length,
      base64,
      suggestedFilename,
      file: {
        filename: suggestedFilename,
        base64,
      },
    };
  }
}
