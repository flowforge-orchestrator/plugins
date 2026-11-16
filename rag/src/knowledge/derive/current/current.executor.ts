import { Allow, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../../internal/json-port';
import type { Claim, DerivedValue } from '../../../contracts/knowledge';
import { deriveCurrent } from './current.logic';

class InputDto {
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

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Claims',
    canBePort: true,
    isPort: true,
    required: true,
  })
  claims!: Claim[];

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'На дату',
    canBePort: true,
    isPort: true,
    required: true,
  })
  asOf!: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'DerivedValue' })
  derived!: DerivedValue;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.derive.current',
  name: 'RAG: вывести текущее значение',
  description: 'Строит DerivedValue на asOf; конфликт accepted → value null + alternatives.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagDeriveCurrentExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const derived = deriveCurrent({
      subject: ctx.inputs.subject,
      predicate: ctx.inputs.predicate,
      claims: fromJsonPort(ctx.inputs.claims, []),
      asOf: ctx.inputs.asOf,
    });
    return { derived: toJsonPort(derived) as never };
  }
}
