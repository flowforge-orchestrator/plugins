import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import helpSearch from './search/help.md';
import helpGraph from './graph/help.md';
import helpOntology from './ontology/help.md';
import helpPrepare from './prepare/help.md';
import helpTopic from './topic/help.md';
import helpRerank from './rerank/help.md';
import helpAggregate from './aggregate/help.md';
import helpCalculate from './calculate/help.md';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { toJsonPort } from '../../internal/json-port';
import type { ToolCard } from '../tools/tool-card';

class ToolOut {
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Карточка' })
  tool!: string;
}

function emit(card: ToolCard): ToolOut {
  return { tool: toJsonPort(card) };
}

const transport = {
  type: 'tcp' as const,
  params: publicationPullEndpointFromEnv(),
};

class SearchIn {
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
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'topK',
    static: true,
    default: 24,
  })
  topK?: number;
}

@Executor<SearchIn, ToolOut>({
  nodeType: 'plugin.rag.provider.search',
  name: 'RAG: провайдер поиска',
  description: 'Карточка гибридного поиска. ID коллекции и topK задаются здесь.',
  help: helpSearch,
  pluginId: 'rag',
  inputs: SearchIn,
  outputs: ToolOut,
  transport,
})
export class RagSearchProviderExecutor {
  execute(ctx: ExecContext<SearchIn>): ToolOut {
    return emit({
      id: 'search',
      description: 'Гибридный поиск по корпусу',
      nodeType: 'plugin.rag.search.query',
      config: { collectionId: ctx.inputs.collectionId, topK: ctx.inputs.topK ?? 24 },
    });
  }
}

class CollectionIn {
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
}

@Executor<CollectionIn, ToolOut>({
  nodeType: 'plugin.rag.provider.graph',
  name: 'RAG: провайдер графа',
  description: 'Карточка обхода графа. ID коллекции задаётся здесь.',
  help: helpGraph,
  pluginId: 'rag',
  inputs: CollectionIn,
  outputs: ToolOut,
  transport,
})
export class RagGraphProviderExecutor {
  execute(ctx: ExecContext<CollectionIn>): ToolOut {
    return emit({
      id: 'graph',
      description: 'Окрестность сущности или связи',
      nodeType: 'plugin.rag.graph.query',
      config: { collectionId: ctx.inputs.collectionId },
    });
  }
}

@Executor<CollectionIn, ToolOut>({
  nodeType: 'plugin.rag.provider.ontology',
  name: 'RAG: провайдер онтологии',
  description: 'Карточка lookup онтологии. ID коллекции задаётся здесь.',
  help: helpOntology,
  pluginId: 'rag',
  inputs: CollectionIn,
  outputs: ToolOut,
  transport,
})
export class RagOntologyProviderExecutor {
  execute(ctx: ExecContext<CollectionIn>): ToolOut {
    return emit({
      id: 'ontology',
      description: 'Срез типов и сущностей',
      nodeType: 'plugin.rag.ontology.lookup',
      config: { collectionId: ctx.inputs.collectionId },
    });
  }
}

@Executor<CollectionIn, ToolOut>({
  nodeType: 'plugin.rag.provider.prepare',
  name: 'RAG: провайдер инвентаря',
  description: 'Карточка инвентаря документов. ID коллекции задаётся здесь.',
  help: helpPrepare,
  pluginId: 'rag',
  inputs: CollectionIn,
  outputs: ToolOut,
  transport,
})
export class RagPrepareProviderExecutor {
  execute(ctx: ExecContext<CollectionIn>): ToolOut {
    return emit({
      id: 'inventory',
      description: 'Инвентарь документов коллекции: docId и заголовок',
      nodeType: 'plugin.rag.graph.prepare',
      config: { collectionId: ctx.inputs.collectionId },
    });
  }
}

class TopicIn {}

@Executor<TopicIn, ToolOut>({
  nodeType: 'plugin.rag.provider.topic',
  name: 'RAG: провайдер рамки вопроса',
  description: 'Карточка рамки вопроса. Сообщение приходит в вызов из хода.',
  help: helpTopic,
  pluginId: 'rag',
  inputs: TopicIn,
  outputs: ToolOut,
  transport,
})
export class RagTopicProviderExecutor {
  execute(): ToolOut {
    return emit({
      id: 'topic',
      description:
        'Рамка вопроса: охват (коллекция, названный документ, вне корпуса), слоты ответа, сущность',
      nodeType: 'plugin.rag.topic',
    });
  }
}

class RerankIn {
  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'topK',
    static: true,
    default: 12,
  })
  topK?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'maxPerDoc',
    static: true,
    default: 2,
  })
  maxPerDoc?: number;
}

@Executor<RerankIn, ToolOut>({
  nodeType: 'plugin.rag.provider.rerank',
  name: 'RAG: провайдер реранка',
  description: 'Карточка реранка. topK и maxPerDoc задаются здесь.',
  help: helpRerank,
  pluginId: 'rag',
  inputs: RerankIn,
  outputs: ToolOut,
  transport,
})
export class RagRerankProviderExecutor {
  execute(ctx: ExecContext<RerankIn>): ToolOut {
    return emit({
      id: 'rerank',
      description: 'Перестановка найденных фрагментов',
      nodeType: 'plugin.rag.rerank',
      config: { topK: ctx.inputs.topK ?? 12, maxPerDoc: ctx.inputs.maxPerDoc ?? 2 },
    });
  }
}

class AggregateIn {}

@Executor<AggregateIn, ToolOut>({
  nodeType: 'plugin.rag.provider.aggregate',
  name: 'RAG: провайдер агрегации',
  description: 'Карточка count/sum/min/max по evidence.',
  help: helpAggregate,
  pluginId: 'rag',
  inputs: AggregateIn,
  outputs: ToolOut,
  transport,
})
export class RagAggregateProviderExecutor {
  execute(): ToolOut {
    return emit({
      id: 'aggregate',
      description: 'Count, sum, min, or max over numeric evidence. Args: {op}.',
      nodeType: 'plugin.rag.aggregate',
    });
  }
}

class CalculateIn {}

@Executor<CalculateIn, ToolOut>({
  nodeType: 'plugin.rag.provider.calculate',
  name: 'RAG: провайдер вычисления',
  description: 'Карточка add/sub/mul/div двух числовых evidence.',
  help: helpCalculate,
  pluginId: 'rag',
  inputs: CalculateIn,
  outputs: ToolOut,
  transport,
})
export class RagCalculateProviderExecutor {
  execute(): ToolOut {
    return emit({
      id: 'calculate',
      description:
        'Add, subtract, multiply, or divide two numeric evidence records. Args: {op, leftId, rightId}.',
      nodeType: 'plugin.rag.calculate',
    });
  }
}