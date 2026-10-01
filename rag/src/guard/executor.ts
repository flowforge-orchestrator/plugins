import {
  Allow,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { normalizeObservations } from '../agent/turn/agent.turn.logic';
import { toJsonPort } from '../internal/json-port';
import { chatMetricsSnapshot } from '../internal/chat-metrics';
import { decideGate, turnBudgetExhausted } from './guard.logic';

const DEFAULT_MAX_TURNS = 6;

class InputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Ответ',
    description: 'Черновик хода; проходит насквозь',
    canBePort: true,
    isPort: true,
    isPrimary: true,
  })
  answer?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    description: 'С вердиктом судьи и рамкой вопроса',
    canBePort: true,
    isPort: true,
  })
  observations?: string;

  @IsOptional()
  @IsBoolean()
  @FieldDecorator({
    type: 'boolean',
    label: 'Лимит ходов',
    description: 'Внешний сигнал; дополняет maxTurns',
    canBePort: true,
    isPort: true,
    default: false,
  })
  turnLimited?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Max turns',
    static: true,
    default: DEFAULT_MAX_TURNS,
  })
  maxTurns?: number;
}

class OutputDto {
  @Allow()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Ответ' })
  answer!: string;

  @Allow()
  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'breakLoop' })
  breakLoop!: boolean;

  @Allow()
  @IsBoolean()
  @FieldDecorator({
    type: 'boolean',
    label: 'continueLoop',
    description: 'Для system.output в теле system.loop',
  })
  continueLoop!: boolean;

  @Allow()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'reason',
    description: 'verdict | conflict | skip_retrieval | turn_limit | open_gaps | no_verdict',
  })
  reason!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Метрики',
    description: 'Терны, токены, тулы, вектор и граф текущего прогона',
  })
  metrics!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.guard',
  name: 'RAG: гард цикла',
  description:
    'Закрывает цикл по полному вердикту, по сданным полям retrieval, по конфликту, по skipRetrieval или по лимиту ходов. Ответ не меняет.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagGuardExecutor {
  execute(ctx: ExecContext<InputDto>): OutputDto {
    const obs = normalizeObservations(ctx.inputs.observations);
    const snapshot = chatMetricsSnapshot(ctx.runId);
    const maxTurns = Number(ctx.inputs.maxTurns ?? DEFAULT_MAX_TURNS);
    const turnLimited =
      !!ctx.inputs.turnLimited || turnBudgetExhausted(snapshot.turns, maxTurns);
    const decision = decideGate({
      verdict: obs.verdict,
      frame: obs.frame,
      mode: obs.task?.mode,
      turnLimited,
    });
    const answer = (ctx.inputs.answer ?? '').trim() || obs.draftAnswer || '';
    return {
      answer,
      breakLoop: decision.breakLoop,
      continueLoop: !decision.breakLoop,
      reason: decision.reason,
      observations: toJsonPort(obs),
      metrics: toJsonPort(snapshot),
    };
  }
}
