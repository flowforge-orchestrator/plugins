import { Allow, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
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
  ConflictBranch,
} from '../../../contracts/knowledge';
import { getRagServices } from '../../../adapters/services';
import { commitClaim } from './commit.logic';

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
    label: 'Решение',
    canBePort: true,
    isPort: true,
    required: true,
  })
  decision!: ClaimDecision;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Ветка',
    canBePort: true,
    isPort: true,
  })
  branch?: ConflictBranch;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Существующие',
    canBePort: true,
    isPort: true,
  })
  existing?: Claim[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID коллекции',
    canBePort: true,
    isPort: true,
  })
  collectionId?: string;

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
    label: 'Утверждено',
    canBePort: true,
    isPort: true,
  })
  assertedAt?: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Claim' })
  claim!: Claim;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Обновления статусов' })
  statusUpdates!: Claim[];

  @IsBoolean()
  @FieldDecorator({ type: 'boolean', label: 'Повтор' })
  reused!: boolean;
}

function mergeClaims(stored: Claim[], port: Claim[]): Claim[] {
  if (port.length === 0) return stored;
  const byId = new Map(stored.map((row) => [row.claimId, row]));
  for (const row of port) byId.set(row.claimId, row);
  return [...byId.values()];
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.claim.commit',
  name: 'RAG: зафиксировать claim',
  description: 'Append-only фиксация Claim по decision/branch; идемпотентна по proposal.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagClaimCommitExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const collectionId = ctx.inputs.collectionId?.trim();
    const portExisting = fromJsonPort(ctx.inputs.existing, [] as Claim[]);
    let existing = portExisting;
    if (collectionId) {
      const stored = await getRagServices().knowledge.listClaims(collectionId);
      existing = mergeClaims(stored, portExisting);
    }
    const result = commitClaim({
      candidate: fromJsonPort(ctx.inputs.candidate, {
        candidateId: '',
        subject: '',
        predicate: '',
        object: '',
        evidenceId: '',
      }),
      decision: fromJsonPort(ctx.inputs.decision, {
        candidateId: '',
        kind: 'new',
      }),
      branch: fromJsonPort(ctx.inputs.branch, undefined),
      existing,
      source: ctx.inputs.source,
      assertedAt: ctx.inputs.assertedAt,
    });
    if (collectionId) {
      const byId = new Map(existing.map((row) => [row.claimId, row]));
      for (const updated of result.statusUpdates) {
        byId.set(updated.claimId, updated);
      }
      if (!result.reused) {
        byId.set(result.claim.claimId, result.claim);
      }
      await getRagServices().knowledge.saveClaims(collectionId, [
        ...byId.values(),
      ]);
    }
    return {
      claim: toJsonPort(result.claim) as never,
      statusUpdates: toJsonPort(result.statusUpdates) as never,
      reused: result.reused,
    };
  }
}
