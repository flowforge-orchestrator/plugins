import { Allow, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { normalizeObservations } from '../../agent/turn/agent.turn.logic';
import {
  isEnabledFlag,
  mergeObservations,
  shouldRunForAction,
} from '../../internal/observations-merge';
import { noteChatGraph } from '../../internal/chat-metrics';
import { formatGraphFocus } from './query.logic';
import { matchQueryEntities } from '../../search/query/search.logic';
import type { SearchHit } from '../../contracts/types';

class InputDto {
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

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Имя узла или связи',
    description: 'Имя сущности, тип узла или тип связи. Не Cypher.',
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
  @FieldDecorator({ type: 'textarea', label: 'Graph context' })
  graphContext!: string;

  @Allow()
  @IsInt()
  @Min(0)
  @FieldDecorator({ type: 'number', label: 'Node count' })
  nodeCount!: number;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsOptional()
  skipped?: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.graph.query',
  name: 'RAG: обход графа',
  description:
    'Параметризованный Cypher: окрестность сущности, узла или связи по имени целиком.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagGraphQueryExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    if (
      !isEnabledFlag(ctx.inputs.enabled) ||
      !shouldRunForAction(ctx.inputs.action, 'graph')
    ) {
      const obs = normalizeObservations(ctx.inputs.observations);
      const { observationsJson } = mergeObservations(obs, {});
      return {
        graphContext: obs.graphContext ?? '',
        nodeCount: 0,
        observations: observationsJson,
        skipped: true,
      };
    }

    if (!ctx.inputs.query.trim()) {
      const { observationsJson } = mergeObservations(
        ctx.inputs.observations,
        { graphContext: '' },
        'graph:empty',
      );
      return {
        graphContext: '',
        nodeCount: 0,
        observations: observationsJson,
      };
    }

    const services = getRagServices();
    const base = normalizeObservations(ctx.inputs.observations);
    const focused = await services.graph.focus({
      collectionId: ctx.inputs.collectionId,
      query: ctx.inputs.query,
    });
    let nodes = focused.nodes;
    let graphContext = focused.context || formatGraphFocus(nodes);

    // Russian / paraphrased slots often miss English labels — seed from catalog.
    if (nodes.length === 0) {
      const catalog =
        (await services.graph.listEntityCatalog?.({
          collectionId: ctx.inputs.collectionId,
        })) ?? [];
      const probe = [
        ctx.inputs.query,
        base.frame?.entity,
        base.task?.question,
        'RAG',
        'hallucination',
        'evidence gates',
        'detection',
      ]
        .filter(Boolean)
        .join(' ');
      const matched = matchQueryEntities(probe, catalog);
      const keywordHits = catalog.filter((e) =>
        /hallucin|evidence\s*gate|ragscope|\brag\b|detection/i.test(e.label),
      );
      const labels = [
        ...new Set(
          [...matched, ...keywordHits].map((e) => e.label).filter(Boolean),
        ),
      ].slice(0, 12);
      if (labels.length > 0) {
        const hits: SearchHit[] = await services.graph.expand({
          collectionId: ctx.inputs.collectionId,
          query: labels[0] ?? ctx.inputs.query,
          depth: 2,
          entityLabels: labels,
        });
        if (hits.length > 0) {
          graphContext = [
            `entities: ${labels.join(', ')}`,
            ...hits.map((h) => {
              const ents = (h.entities ?? []).map((e) => e.label).join(', ');
              const rels = (h.relations ?? [])
                .map((r) => `${r.fromLabel}-[${r.typeId}]->${r.toLabel}`)
                .join('; ');
              return `[${h.docId}] ${h.chunkId}${ents ? ` | ${ents}` : ''}${rels ? ` | ${rels}` : ''}\n${h.text}`;
            }),
          ].join('\n\n');
          nodes = labels.map((label) => ({
            entityId: '',
            label,
            typeId: '',
            docIds: [],
            excerpts: [],
            links: [],
          }));
        }
      }
    }

    noteChatGraph(ctx.runId, nodes.length);
    const { observationsJson } = mergeObservations(
      base,
      { graphContext, queue: base.queue },
      'graph',
    );
    return {
      graphContext,
      nodeCount: nodes.length,
      observations: observationsJson,
    };
  }
}
