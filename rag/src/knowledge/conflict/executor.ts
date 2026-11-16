import { Allow, IsBoolean, IsOptional } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type { Claim, ConflictBranch } from '../../contracts/knowledge';
import { applyConflictPolicy } from './policy.logic';

class InputDto {
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Левый claim',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  left!: Claim;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Правый claim',
    canBePort: true,
    isPort: true,
    required: true,
  })
  right!: Claim;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Авторитетность источников',
    static: true,
  })
  sourceAuthorityOrder?: string[];

  @IsOptional()
  @IsBoolean()
  @FieldDecorator({
    type: 'boolean',
    label: 'То же определение',
    static: true,
    default: true,
  })
  sameDefinition?: boolean;

  @IsOptional()
  @IsBoolean()
  @FieldDecorator({
    type: 'boolean',
    label: 'Тот же период = overlap',
    static: true,
    default: true,
  })
  samePeriodRequiresOverlap?: boolean;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Ветка' })
  branch!: ConflictBranch;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.conflict.policy',
  name: 'RAG: политика конфликта',
  description: 'Выбирает ConflictBranch для пары claims; ambiguous даёт review item.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagConflictPolicyExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const branch = applyConflictPolicy({
      left: fromJsonPort(ctx.inputs.left, null as never),
      right: fromJsonPort(ctx.inputs.right, null as never),
      sourceAuthorityOrder: fromJsonPort(ctx.inputs.sourceAuthorityOrder, undefined),
      sameDefinition: ctx.inputs.sameDefinition,
      samePeriodRequiresOverlap: ctx.inputs.samePeriodRequiresOverlap,
    });
    return { branch: toJsonPort(branch) as never };
  }
}
