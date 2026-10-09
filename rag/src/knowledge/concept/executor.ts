import { Allow, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type {
  Concept,
  ConceptCandidate,
  ConceptDecision,
} from '../../contracts/knowledge';
import { resolveConcept } from './resolve.logic';

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
  candidate!: ConceptCandidate;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Существующие',
    canBePort: true,
    isPort: true,
    required: true,
  })
  existing!: Concept[];
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Решение' })
  decision!: ConceptDecision;

  @IsString()
  @MinLength(1)
  @FieldDecorator({ type: 'string', label: 'ID понятия' })
  conceptId!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.concept.resolve',
  name: 'RAG: разрешить понятие',
  description: 'Сводит ConceptCandidate к ConceptDecision (NEW|MATCH|SUBTYPE).',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagConceptResolveExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const result = resolveConcept({
      candidate: fromJsonPort(ctx.inputs.candidate, {
        candidateId: '',
        name: '',
      }),
      existing: fromJsonPort(ctx.inputs.existing, []),
    });
    return {
      decision: toJsonPort(result.decision) as never,
      conceptId: result.conceptId,
    };
  }
}
