import { Allow, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { toJsonPort } from '../../internal/json-port';
import { normalizeObservations } from '../../agent/turn/agent.turn.logic';
import {
  isEnabledFlag,
  mergeObservations,
  shouldRunForAction,
} from '../../internal/observations-merge';
import { buildInventory, formatInventory } from './prepare.logic';
import { noteChatTool } from '../../internal/chat-metrics';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'ID коллекции',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  collectionId!: string;

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
    type: 'string',
    label: 'Action',
    canBePort: true,
    isPort: true,
  })
  action?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'boolean',
    label: 'Enabled',
    canBePort: true,
    isPort: true,
    default: true,
  })
  enabled?: boolean | string;
}

class OutputDto {
  @Allow()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Инвентарь' })
  inventory!: string;

  @Allow()
  @IsInt()
  @Min(0)
  @FieldDecorator({ type: 'number', label: 'Документов' })
  docCount!: number;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsOptional()
  skipped?: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.graph.prepare',
  name: 'RAG: инвентарь коллекции',
  description:
    'Каждый документ коллекции из графа: docId и заголовок первого чанка. Текст не разбирается.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagGraphPrepareExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const existing = normalizeObservations(ctx.inputs.observations).inventory;
    if (
      !isEnabledFlag(ctx.inputs.enabled) ||
      !shouldRunForAction(ctx.inputs.action, 'inventory')
    ) {
      const { observationsJson } = mergeObservations(ctx.inputs.observations, {});
      return {
        inventory: existing ? toJsonPort(existing) : '',
        docCount: existing?.docCount ?? 0,
        observations: observationsJson,
        skipped: true,
      };
    }

    noteChatTool(ctx.runId);
    const services = getRagServices();
    const rows = await services.graph.listDocuments({
      collectionId: ctx.inputs.collectionId,
    });
    const inventory = buildInventory(rows);
    const { observationsJson } = mergeObservations(
      ctx.inputs.observations,
      { inventory },
      'inventory',
    );
    return {
      inventory: toJsonPort(inventory),
      docCount: inventory.docCount,
      observations: observationsJson,
    };
  }
}

export { formatInventory };
