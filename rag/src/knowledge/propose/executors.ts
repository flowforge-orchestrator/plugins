import {
  Allow,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import helpClaim from './claim/help.md';
import helpRelation from './relation/help.md';
import helpConcept from './concept/help.md';
import helpAlias from './alias/help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type { Proposal } from '../../contracts/knowledge';
import {
  proposeAlias,
  proposeClaim,
  proposeConcept,
  proposeRelation,
} from './propose.logic';

const transport = {
  type: 'tcp' as const,
  params: publicationPullEndpointFromEnv(),
};

class ProposalOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Proposal' })
  proposal!: Proposal;
}

class ProposeClaimIn {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Субъект',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  subject!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Предикат',
    canBePort: true,
    isPort: true,
    required: true,
  })
  predicate!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Объект',
    canBePort: true,
    isPort: true,
    required: true,
  })
  object!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Evidence ID',
    canBePort: true,
    isPort: true,
  })
  evidenceId?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Span',
    canBePort: true,
    isPort: true,
  })
  span?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'validFrom',
    canBePort: true,
    isPort: true,
  })
  validFrom?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'validTo',
    canBePort: true,
    isPort: true,
  })
  validTo?: string;
}

@Executor<ProposeClaimIn, ProposalOut>({
  nodeType: 'plugin.rag.propose.claim',
  name: 'RAG: предложить claim',
  description: 'Proposal claim в статусе candidate; S2 не пишет.',
  help: helpClaim,
  pluginId: 'rag',
  inputs: ProposeClaimIn,
  outputs: ProposalOut,
  transport,
})
export class RagProposeClaimExecutor {
  async execute(ctx: ExecContext<ProposeClaimIn>): Promise<ProposalOut> {
    const proposal = proposeClaim({
      subject: ctx.inputs.subject,
      predicate: ctx.inputs.predicate,
      object: ctx.inputs.object,
      evidenceId: ctx.inputs.evidenceId,
      span: fromJsonPort(ctx.inputs.span, ctx.inputs.span),
      validFrom: ctx.inputs.validFrom,
      validTo: ctx.inputs.validTo,
    });
    return { proposal: toJsonPort(proposal) as never };
  }
}

class ProposeRelationIn {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Тип',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  typeId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'От',
    canBePort: true,
    isPort: true,
    required: true,
  })
  fromEntityId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'К',
    canBePort: true,
    isPort: true,
    required: true,
  })
  toEntityId!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Evidence ID',
    canBePort: true,
    isPort: true,
  })
  evidenceId?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Span',
    canBePort: true,
    isPort: true,
  })
  span?: string;
}

@Executor<ProposeRelationIn, ProposalOut>({
  nodeType: 'plugin.rag.propose.relation',
  name: 'RAG: предложить relation',
  description: 'Proposal relation в статусе candidate; S2 не пишет.',
  help: helpRelation,
  pluginId: 'rag',
  inputs: ProposeRelationIn,
  outputs: ProposalOut,
  transport,
})
export class RagProposeRelationExecutor {
  async execute(ctx: ExecContext<ProposeRelationIn>): Promise<ProposalOut> {
    const proposal = proposeRelation({
      typeId: ctx.inputs.typeId,
      fromEntityId: ctx.inputs.fromEntityId,
      toEntityId: ctx.inputs.toEntityId,
      evidenceId: ctx.inputs.evidenceId,
      span: fromJsonPort(ctx.inputs.span, ctx.inputs.span),
    });
    return { proposal: toJsonPort(proposal) as never };
  }
}

class ProposeConceptIn {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Имя',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  name!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Aliases',
    canBePort: true,
    isPort: true,
  })
  aliases?: string[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Определение',
    canBePort: true,
    isPort: true,
  })
  definition?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Evidence ID',
    canBePort: true,
    isPort: true,
  })
  evidenceId?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Span',
    canBePort: true,
    isPort: true,
  })
  span?: string;
}

@Executor<ProposeConceptIn, ProposalOut>({
  nodeType: 'plugin.rag.propose.concept',
  name: 'RAG: предложить понятие',
  description: 'Proposal concept в статусе candidate; S2 не пишет.',
  help: helpConcept,
  pluginId: 'rag',
  inputs: ProposeConceptIn,
  outputs: ProposalOut,
  transport,
})
export class RagProposeConceptExecutor {
  async execute(ctx: ExecContext<ProposeConceptIn>): Promise<ProposalOut> {
    const proposal = proposeConcept({
      name: ctx.inputs.name,
      aliases: fromJsonPort(ctx.inputs.aliases, []),
      definition: ctx.inputs.definition,
      evidenceId: ctx.inputs.evidenceId,
      span: fromJsonPort(ctx.inputs.span, ctx.inputs.span),
    });
    return { proposal: toJsonPort(proposal) as never };
  }
}

class ProposeAliasIn {
  @IsIn(['entity', 'concept'])
  @FieldDecorator({
    type: 'select',
    label: 'Вид',
    description: 'entity | concept',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  kind!: 'entity' | 'concept';

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Цель',
    canBePort: true,
    isPort: true,
    required: true,
  })
  targetId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Alias',
    canBePort: true,
    isPort: true,
    required: true,
  })
  alias!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Evidence ID',
    canBePort: true,
    isPort: true,
  })
  evidenceId?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Span',
    canBePort: true,
    isPort: true,
  })
  span?: string;
}

@Executor<ProposeAliasIn, ProposalOut>({
  nodeType: 'plugin.rag.propose.alias',
  name: 'RAG: предложить alias',
  description: 'Proposal alias в статусе candidate; S2 не пишет.',
  help: helpAlias,
  pluginId: 'rag',
  inputs: ProposeAliasIn,
  outputs: ProposalOut,
  transport,
})
export class RagProposeAliasExecutor {
  async execute(ctx: ExecContext<ProposeAliasIn>): Promise<ProposalOut> {
    const proposal = proposeAlias({
      kind: ctx.inputs.kind,
      targetId: ctx.inputs.targetId,
      alias: ctx.inputs.alias,
      evidenceId: ctx.inputs.evidenceId,
      span: fromJsonPort(ctx.inputs.span, ctx.inputs.span),
    });
    return { proposal: toJsonPort(proposal) as never };
  }
}
