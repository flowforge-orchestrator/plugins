import { Allow, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeContainer } from '../container.logic';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Образ',
    description: 'Ссылка образа без пробелов',
    required: true,
    static: true,
  })
  image!: string;

  @Allow()
  @IsOptional()
  @FieldDecorator({
    type: 'string',
    label: 'Команда',
    description: 'JSON-массив аргументов',
    static: true,
  })
  command?: string;

  @Allow()
  @IsOptional()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Переменные',
    description: 'Объект строковых переменных окружения',
    static: true,
  })
  env?: Record<string, unknown>;

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
  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Код выхода' })
  exitCode!: number;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'stdout' })
  stdout!: string;

  @IsString()
  @FieldDecorator({ type: 'string', label: 'stderr' })
  stderr!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.execution.container',
  name: 'Контейнер',
  description:
    'Запускает контейнер без сети и привилегий, ждёт завершения и удаляет его.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'execution',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ExecutionContainerExecutor {
  execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return executeContainer(ctx.inputs);
  }
}
