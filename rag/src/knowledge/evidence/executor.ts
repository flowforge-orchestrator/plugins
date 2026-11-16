import { Allow, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type { Evidence } from '../../contracts/knowledge';
import { getRagServices } from '../../adapters/services';
import { commitEvidence } from './commit.logic';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  text!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID документа',
    canBePort: true,
    isPort: true,
    required: true,
  })
  docId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID коллекции',
    canBePort: true,
    isPort: true,
    required: true,
  })
  collectionId!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Источник',
    canBePort: true,
    isPort: true,
  })
  source?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Наблюдено',
    canBePort: true,
    isPort: true,
  })
  observedAt?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Существующие',
    canBePort: true,
    isPort: true,
  })
  existing?: Evidence[];
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence' })
  evidence!: Evidence;

  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'Дубликат' })
  duplicate!: boolean;
}

function mergeEvidence(stored: Evidence[], port: Evidence[]): Evidence[] {
  if (port.length === 0) return stored;
  const byId = new Map(stored.map((row) => [row.id, row]));
  for (const row of port) byId.set(row.id, row);
  return [...byId.values()];
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.evidence.commit',
  name: 'RAG: зафиксировать evidence',
  description: 'Пишет Evidence S0; повтор хеша возвращает duplicate.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagEvidenceCommitExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const stored = await services.knowledge.listEvidence(ctx.inputs.collectionId);
    const portExisting = fromJsonPort(ctx.inputs.existing, [] as Evidence[]);
    const existing = mergeEvidence(stored, portExisting);
    const result = commitEvidence({
      text: ctx.inputs.text,
      docId: ctx.inputs.docId,
      collectionId: ctx.inputs.collectionId,
      source: ctx.inputs.source,
      observedAt: ctx.inputs.observedAt,
      existing,
    });
    if (!result.duplicate) {
      await services.knowledge.saveEvidence(ctx.inputs.collectionId, [
        ...existing,
        result.evidence,
      ]);
    }
    return {
      evidence: toJsonPort(result.evidence) as never,
      duplicate: result.duplicate,
    };
  }
}
