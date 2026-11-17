import { Allow, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { executeEdge } from '../edge.logic';

class InputDto {
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Функция',
    description: 'Выражение, тело с return или (input) => …',
    required: true,
    static: true,
  })
  source!: string;

  @Allow()
  @IsOptional()
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Вход',
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
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.execution.edge',
  name: 'Edge-функция',
  description: 'Преобразует значение между узлами санитизированным JavaScript.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'execution',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class ExecutionEdgeExecutor {
  execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return Promise.resolve(executeEdge(ctx.inputs));
  }
}
