import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type {
  Claim,
  Concept,
  Entity,
  Evidence,
  Workspace,
  WorkspaceBudget,
  WorkspaceHypothesis,
} from '../../contracts/knowledge';
import { buildWorkspace } from './build.logic';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Вопрос',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  question!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Сущности',
    canBePort: true,
    isPort: true,
  })
  entities?: Entity[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Понятия',
    canBePort: true,
    isPort: true,
  })
  concepts?: Concept[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Claims',
    canBePort: true,
    isPort: true,
  })
  claims?: Claim[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Evidence',
    canBePort: true,
    isPort: true,
  })
  evidence?: Evidence[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Гипотезы',
    canBePort: true,
    isPort: true,
  })
  hypotheses?: WorkspaceHypothesis[];

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Окно',
    canBePort: true,
    isPort: true,
  })
  timeWindow?: { from?: string; to?: string };

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Бюджет',
    static: true,
  })
  budget?: Partial<WorkspaceBudget>;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Workspace' })
  workspace!: Workspace;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.workspace.build',
  name: 'RAG: собрать workspace',
  description: 'Собирает ограниченный Workspace и фиксирует отброшенное.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagWorkspaceBuildExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const workspace = buildWorkspace({
      question: ctx.inputs.question,
      entities: fromJsonPort(ctx.inputs.entities, []),
      concepts: fromJsonPort(ctx.inputs.concepts, []),
      claims: fromJsonPort(ctx.inputs.claims, []),
      evidence: fromJsonPort(ctx.inputs.evidence, []),
      hypotheses: fromJsonPort(ctx.inputs.hypotheses, []),
      timeWindow: fromJsonPort(ctx.inputs.timeWindow, undefined),
      budget: fromJsonPort(ctx.inputs.budget, undefined),
    });
    return { workspace: toJsonPort(workspace) as never };
  }
}
