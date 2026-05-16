import * as fs from 'fs/promises';
import * as path from 'path';
import * as XLSX from 'xlsx';
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
    description: 'Путь к xlsx файлу',
    isPort: true,
    canBePort: true,
    isPrimary: true,
  })
  path!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Лист',
    description: 'Имя листа. Пусто — первый лист',
    default: '',
    static: true,
  })
  sheetName?: string;

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

  @FieldDecorator({
    type: 'keyvalue',
    label: 'Листы',
    description: 'Список имён листов',
  })
  sheetNames!: string[];
}

@Executor<InputDto, OutputDto>({
  nodeType: 'system.office.xlsx.read',
  name: 'Office: xlsx read',
  description: 'Читает xlsx файл и возвращает строки выбранного листа.',
  help,
  pluginId: 'office',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class SystemOfficeXlsxReadExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const base = ctx.inputs.basePath ?? process.env.RUN_WORKSPACE_PATH ?? '';
    const fullPath = resolvePath(base, ctx.inputs.path ?? '');
    await fs.access(fullPath);
    const wb = XLSX.readFile(fullPath, { cellDates: true });
    const sheetName = ctx.inputs.sheetName?.trim() || wb.SheetNames[0];
    if (!sheetName) {
      return { rows: [], sheetNames: [] };
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });
    return { rows, sheetNames: wb.SheetNames };
  }
}
