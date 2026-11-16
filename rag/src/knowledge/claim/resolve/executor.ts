import { Allow, IsInt, IsOptional, Min } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../../internal/json-port';
import type {
  Claim,
  ClaimCandidate,
  ClaimDecision,
} from '../../../contracts/knowledge';
import { resolveClaim } from './resolve.logic';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Кандидат',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  candidate!: ClaimCandidate;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Существующие',
    canBePort: true,
    isPort: true,
    required: true,
  })
  existing!: Claim[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @FieldDecorator({
    type: 'number',
    label: 'Допуск окон (дни)',
    static: true,
    default: 0,
  })
  windowToleranceDays?: number;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Решение' })
  decision!: ClaimDecision;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.claim.resolve',
  name: 'RAG: разрешить claim',
  description: 'Сравнивает ClaimCandidate с существующими: new | duplicate | conflict.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagClaimResolveExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const result = resolveClaim({
      candidate: fromJsonPort(ctx.inputs.candidate, {
        candidateId: '',
        subject: '',
        predicate: '',
        object: '',
        evidenceId: '',
      }),
      existing: fromJsonPort(ctx.inputs.existing, []),
      windowToleranceDays: ctx.inputs.windowToleranceDays,
    });
    return { decision: toJsonPort(result.decision) as never };
  }
}
