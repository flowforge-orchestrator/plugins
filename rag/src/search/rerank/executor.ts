import { Allow, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { assembleContext } from '../query/search.logic';
import { toJsonPort } from '../../internal/json-port';
import type { SearchHit } from '../../contracts/types';
import { normalizeObservations } from '../../agent/turn/agent.turn.logic';
import {
  isEnabledFlag,
  mergeObservations,
  shouldRunForAction,
} from '../../internal/observations-merge';
import { noteChatTool } from '../../internal/chat-metrics';
import {
  applyRerankScores,
  buildRerankSystemPrompt,
  buildRerankUserPrompt,
  normalizeHitsPort,
  parseRerankScorePayload,
  selectDiverseHits,
} from './rerank.logic';

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

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Кандидаты (hits)',
    description: 'JSON хитов; если пусто — из observations.hits',
    canBePort: true,
    isPort: true,
  })
  hits?: string;

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

  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'topK после реранка',
    static: true,
    default: 12,
  })
  topK!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Макс. чанков на документ',
    static: true,
    default: 2,
  })
  maxPerDoc?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ LLM / rerank',
    static: true,
    secretKind: 'OPENAI_API_KEY',
  })
  apiKey?: string;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Хиты после реранка' })
  hits!: SearchHit[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Контекст' })
  context!: string;

  @Allow()
  @FieldDecorator({ type: 'number', label: 'Число хитов' })
  hitCount!: number;

  @Allow()
  @FieldDecorator({ type: 'number', label: 'Уникальных документов' })
  docCount!: number;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsOptional()
  skipped?: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.rerank',
  name: 'RAG: реранк',
  description:
    'Реранжирует кандидатов поиска (Ollama/LLM), расширяет покрытие по docId и собирает контекст для ответа.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagRerankExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const obs = normalizeObservations(ctx.inputs.observations);
    if (
      !isEnabledFlag(ctx.inputs.enabled) ||
      !shouldRunForAction(ctx.inputs.action, 'rerank')
    ) {
      const { observationsJson } = mergeObservations(obs, {});
      return {
        hits: toJsonPort(obs.hits ?? []) as never,
        context: obs.context ?? '',
        hitCount: obs.hits?.length ?? 0,
        docCount: new Set((obs.hits ?? []).map((h) => h.docId)).size,
        observations: observationsJson,
        skipped: true,
      };
    }

    const services = getRagServices();
    const fromPort = ctx.inputs.hits
      ? normalizeHitsPort(ctx.inputs.hits)
      : [];
    const candidates = fromPort.length ? fromPort : (obs.hits ?? []);
    const topK = Number(ctx.inputs.topK ?? 12);
    const maxPerDoc = Number(ctx.inputs.maxPerDoc ?? 2);

    noteChatTool(ctx.runId);
    let ranked = candidates;
    if (candidates.length > 1) {
      try {
        const payload = await services.reranker.score({
          query: ctx.inputs.query,
          hits: candidates,
          apiKey: ctx.inputs.apiKey ?? '',
          runId: ctx.runId,
          systemPrompt: buildRerankSystemPrompt(),
          userPrompt: buildRerankUserPrompt({
            query: ctx.inputs.query,
            hits: candidates,
          }),
        });
        const scores = parseRerankScorePayload(payload);
        if (scores.length) {
          ranked = applyRerankScores(candidates, scores);
        }
      } catch {
        ranked = [...candidates].sort((a, b) => b.score - a.score);
      }
    }

    const hits = selectDiverseHits(ranked, { topK, maxPerDoc });
    const { context } = assembleContext(hits, 12000);
    const docCount = new Set(hits.map((h) => h.docId)).size;
    const { observationsJson } = mergeObservations(
      obs,
      { hits, context },
      'rerank',
    );
    return {
      hits: toJsonPort(hits) as never,
      context,
      hitCount: hits.length,
      docCount,
      observations: observationsJson,
    };
  }
}
