import {
  Allow,
  IsBoolean,
  IsInt,
  IsNumber,
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
import { toJsonPort } from '../internal/json-port';
import { normalizeObservations } from '../agent/turn/agent.turn.logic';
import { mergeObservations } from '../internal/observations-merge';
import { historyWithToolResult } from '../agent/turn/history-state';
import { verifyClaims } from '../research/verify.logic';

class InputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Вопрос',
    canBePort: true,
    isPort: true,
    isPrimary: true,
  })
  message?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Черновик',
    description: 'Если пусто — берётся observations.draftAnswer',
    canBePort: true,
    isPort: true,
  })
  answer?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Observations',
    canBePort: true,
    isPort: true,
  })
  observations?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Решение хода',
    description: 'Observations хода. Поля, которые ход сдал, приходят отсюда.',
    canBePort: true,
    isPort: true,
  })
  decision?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'История',
    description: 'Вердикт дописывается в последний tool-результат',
    canBePort: true,
    isPort: true,
  })
  history?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ LLM',
    static: true,
    secretKind: 'OPENAI_API_KEY',
  })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM model', static: true })
  llmModel?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM base URL', static: true })
  llmBaseUrl?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Temperature',
    static: true,
    default: 0,
  })
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({ type: 'number', label: 'Max tokens', static: true })
  maxTokens?: number;
}

class OutputDto {
  @Allow()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Вердикт JSON' })
  verdict!: string;

  @Allow()
  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'consistent' })
  consistent!: boolean;

  @Allow()
  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'sufficient' })
  sufficient!: boolean;

  @Allow()
  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'complete' })
  complete!: boolean;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'История' })
  history!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.judge',
  name: 'RAG: судья',
  description:
    'Сверяет claims с evidence кодом: копия наблюдения, вычисленный факт с родителями, гипотеза не становится фактом, конфликт значений явный.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagJudgeExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const obs = normalizeObservations(ctx.inputs.observations);
    const decision = normalizeObservations(ctx.inputs.decision);
    const task = decision.task ?? obs.task;
    const verification = verifyClaims({
      claims: obs.researchClaims ?? [],
      evidence: obs.evidence ?? [],
      hypotheses: obs.hypotheses,
      task,
    });
    const verdict = {
      consistent: verification.consistent,
      sufficient: verification.sufficient,
      complete: verification.complete,
      gaps: verification.gaps.map((gap) => ({
        kind: gap.kind === 'conflict' ? 'conflict' as const : gap.kind === 'missing_slot' ? 'missing_slot' as const : 'unsupported' as const,
        slot: gap.slot,
        detail: gap.detail,
      })),
      claims: [],
    };
    const { observations, observationsJson } = mergeObservations(
      obs,
      {
        verdict,
        researchClaims: verification.claims,
        hypotheses: verification.hypotheses,
        limitations: verification.limitations,
        ...(task ? { task } : {}),
      },
      'judge',
    );
    return {
      verdict: toJsonPort(verdict),
      consistent: verdict.consistent,
      sufficient: verdict.sufficient,
      complete: verdict.complete,
      observations: observationsJson,
      history: historyWithToolResult(ctx.inputs.history, 'judge', observations),
    };
  }
}
