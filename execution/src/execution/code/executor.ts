import { Allow, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeCode } from '../code.logic';

class InputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Язык',
    description: 'javascript, python или shell',
    static: true,
    default: 'javascript',
  })
  language?: string;

  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Исходник',
    description: 'Текст программы',
    required: true,
    static: true,
    canBePort: true,
    isPort: true,
  })
  source!: string;

  @Allow()
  @IsOptional()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Вход',
    description: 'Объект input',
    canBePort: true,
    isPort: true,
  })
  input?: unknown;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Таймаут, мс',
    static: true,
    default: 1000,
  })
  timeoutMs?: number;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'keyvalue', label: 'Значение' })
  value!: unknown;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'stdout' })
  stdout!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'stderr' })
  stderr!: string;

  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Код выхода' })
  exitCode!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.execution.code',
  name: 'Код',
  description:
    'JavaScript в песочнице или python/shell в одноразовом контейнере без сети.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'execution',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ExecutionCodeExecutor {
  execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return executeCode(ctx.inputs);
  }
}
