import { Allow, IsOptional, IsString } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { normalizeStrategy } from '../turn/planning';

class InputDto {
  @IsOptional()
  @Allow()
  @IsString()
  @FieldDecorator({
    type: 'select',
    label: 'Стратегия',
    isPrimary: true,
    static: true,
    default: 'cot',
  })
  strategy?: string;
}

class OutputDto {
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Стратегия' })
  strategy!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.agent.plan',
  name: 'RAG: стратегия',
  description:
    'Выбор стратегии планирования. Выход strategy — вход хода агента.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagAgentPlanExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return { strategy: normalizeStrategy(ctx.inputs.strategy) };
  }
}
