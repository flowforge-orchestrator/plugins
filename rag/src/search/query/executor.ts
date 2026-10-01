import {
  Allow,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { selectDiverseHits } from '../rerank/rerank.logic';
import { assembleContext, fuseHits, mergeWorkingSet } from './search.logic';
import { toJsonPort } from '../../internal/json-port';
import type { SearchHit } from '../../contracts/types';
import { normalizeObservations } from '../../agent/turn/agent.turn.logic';
import {
  isEnabledFlag,
  mergeObservations,
  shouldRunForAction,
} from '../../internal/observations-merge';
import { noteChatVector } from '../../internal/chat-metrics';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Запрос',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  query!: string;

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

  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'topK',
    static: true,
    default: 24,
  })
  topK!: number;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'Пропустить retrieval',
    description: 'true/false string or boolean',
    canBePort: true,
    isPort: true,
    default: 'false',
  })
  skipRetrieval?: string | boolean;

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

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ эмбеддингов',
    static: true,
    secretKind: 'OPENAI_API_KEY',
  })
  embeddingApiKey?: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Хиты' })
  hits!: SearchHit[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Контекст' })
  context!: string;

  @Allow()
  @FieldDecorator({ type: 'number', label: 'Число хитов' })
  hitCount!: number;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsOptional()
  skipped?: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.search.query',
  name: 'RAG: поиск',
  description:
    'Гибридный поиск: dense + графовое соседство, RRF, сборка контекста.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagSearchQueryExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    if (
      !isEnabledFlag(ctx.inputs.enabled) ||
      !shouldRunForAction(ctx.inputs.action, 'search')
    ) {
      const obs = normalizeObservations(ctx.inputs.observations);
      const { observationsJson } = mergeObservations(obs, {});
      return {
        hits: toJsonPort(obs.hits ?? []) as never,
        context: obs.context ?? '',
        hitCount: obs.hits?.length ?? 0,
        observations: observationsJson,
        skipped: true,
      };
    }

    const obsTopicSkip = normalizeObservations(ctx.inputs.observations).frame
      ?.skipRetrieval;
    const skip =
      ctx.inputs.skipRetrieval === true ||
      ctx.inputs.skipRetrieval === 'true' ||
      ctx.inputs.skipRetrieval === '1' ||
      obsTopicSkip === true;
    if (skip) {
      const { observationsJson } = mergeObservations(
        ctx.inputs.observations,
        { hits: [], context: '' },
        'search:skip',
      );
      return {
        hits: toJsonPort([]) as never,
        context: '',
        hitCount: 0,
        observations: observationsJson,
      };
    }
    const services = getRagServices();
    const topK = Math.max(1, Number(ctx.inputs.topK ?? 24));
    const embedded = await services.embedder.embed(
      [ctx.inputs.query],
      ctx.inputs.embeddingApiKey ?? '',
    );
    const dense = await services.vectors.search({
      collectionId: ctx.inputs.collectionId,
      vector: embedded.vectors[0] ?? [],
      queryText: ctx.inputs.query,
      topK,
    });
    const graphHits = await services.graph.expand({
      collectionId: ctx.inputs.collectionId,
      query: ctx.inputs.query,
      depth: 1,
    });
    const pool = fuseHits(
      [dense, graphHits],
      60,
      Math.max(topK * 4, 48),
    );
    const fresh = selectDiverseHits(pool, { topK, maxPerDoc: 2 });
    noteChatVector(
      ctx.runId,
      dense.length,
      embedded.usageTokens ?? 0,
      graphHits.length,
    );
    const prior = normalizeObservations(ctx.inputs.observations).hits ?? [];
    const hits = mergeWorkingSet(fresh, prior, Math.max(topK * 2, 48));
    const { context } = assembleContext(hits, 12000);
    const { observationsJson } = mergeObservations(
      ctx.inputs.observations,
      { hits, context },
      'search',
    );
    return {
      hits: toJsonPort(hits) as never,
      context,
      hitCount: hits.length,
      observations: observationsJson,
    };
  }
}
