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
import helpClaims from './claims/help.md';
import helpEntities from './entities/help.md';
import helpEvents from './events/help.md';
import helpEvidence from './evidence/help.md';
import helpInspect from './inspect-history/help.md';
import helpCompare from './compare-periods/help.md';
import { getRagServices } from '../../adapters/services';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { fromJsonPort, toJsonPort } from '../../internal/json-port';
import type {
  Claim,
  Entity,
  Event,
  Evidence,
} from '../../contracts/knowledge';
import {
  comparePeriods,
  findClaims,
  findEntities,
  findEvents,
  findEvidence,
  inspectHistory,
  type TimeWindow,
} from './find.logic';

const transport = {
  type: 'tcp' as const,
  params: publicationPullEndpointFromEnv(),
};

class FindClaimsIn {
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
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Лимит',
    static: true,
    default: 50,
  })
  limit?: number;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Claims',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  claims!: Claim[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Субъект',
    canBePort: true,
    isPort: true,
  })
  subject?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Предикат',
    canBePort: true,
    isPort: true,
  })
  predicate?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Окно',
    canBePort: true,
    isPort: true,
  })
  timeWindow?: TimeWindow;
}

class FindClaimsOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Записи' })
  records!: Claim[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence IDs' })
  evidenceIds!: string[];
}

@Executor<FindClaimsIn, FindClaimsOut>({
  nodeType: 'plugin.rag.find.claims',
  name: 'RAG: найти claims',
  description: 'Чтение claims S2 по subject/predicate и окну времени.',
  help: helpClaims,
  pluginId: 'rag',
  inputs: FindClaimsIn,
  outputs: FindClaimsOut,
  transport,
})
export class RagFindClaimsExecutor {
  async execute(ctx: ExecContext<FindClaimsIn>): Promise<FindClaimsOut> {
    const result = findClaims({
      collectionId: ctx.inputs.collectionId,
      claims: fromJsonPort(ctx.inputs.claims, []),
      subject: ctx.inputs.subject,
      predicate: ctx.inputs.predicate,
      timeWindow: fromJsonPort(ctx.inputs.timeWindow, undefined),
      limit: ctx.inputs.limit,
    });
    return {
      records: toJsonPort(result.records) as never,
      evidenceIds: toJsonPort(result.evidenceIds) as never,
    };
  }
}

class FindEntitiesIn {
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
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Лимит',
    static: true,
    default: 50,
  })
  limit?: number;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Сущности',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  entities!: Entity[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Запрос',
    canBePort: true,
    isPort: true,
  })
  query?: string;
}

class FindEntitiesOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Записи' })
  records!: Entity[];
}

@Executor<FindEntitiesIn, FindEntitiesOut>({
  nodeType: 'plugin.rag.find.entities',
  name: 'RAG: найти сущности',
  description: 'Чтение сущностей S2 по запросу.',
  help: helpEntities,
  pluginId: 'rag',
  inputs: FindEntitiesIn,
  outputs: FindEntitiesOut,
  transport,
})
export class RagFindEntitiesExecutor {
  async execute(ctx: ExecContext<FindEntitiesIn>): Promise<FindEntitiesOut> {
    const result = findEntities({
      collectionId: ctx.inputs.collectionId,
      entities: fromJsonPort(ctx.inputs.entities, []),
      query: ctx.inputs.query,
      limit: ctx.inputs.limit,
    });
    return { records: toJsonPort(result.records) as never };
  }
}

class FindEventsIn {
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
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Лимит',
    static: true,
    default: 50,
  })
  limit?: number;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'События',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  events!: Event[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Тип',
    canBePort: true,
    isPort: true,
  })
  typeId?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Окно',
    canBePort: true,
    isPort: true,
  })
  timeWindow?: TimeWindow;
}

class FindEventsOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Записи' })
  records!: Event[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence IDs' })
  evidenceIds!: string[];
}

@Executor<FindEventsIn, FindEventsOut>({
  nodeType: 'plugin.rag.find.events',
  name: 'RAG: найти события',
  description: 'Чтение событий S2 по типу и окну.',
  help: helpEvents,
  pluginId: 'rag',
  inputs: FindEventsIn,
  outputs: FindEventsOut,
  transport,
})
export class RagFindEventsExecutor {
  async execute(ctx: ExecContext<FindEventsIn>): Promise<FindEventsOut> {
    const result = findEvents({
      collectionId: ctx.inputs.collectionId,
      events: fromJsonPort(ctx.inputs.events, []),
      typeId: ctx.inputs.typeId,
      timeWindow: fromJsonPort(ctx.inputs.timeWindow, undefined),
      limit: ctx.inputs.limit,
    });
    return {
      records: toJsonPort(result.records) as never,
      evidenceIds: toJsonPort(result.evidenceIds) as never,
    };
  }
}

class FindEvidenceIn {
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
    label: 'Лимит',
    static: true,
    default: 50,
  })
  limit?: number;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Evidence',
    canBePort: true,
    isPort: true,
    description:
      'Опционально. Пусто — читаем S0 из FileKnowledgeStore коллекции.',
  })
  evidence?: Evidence[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Запрос',
    canBePort: true,
    isPort: true,
  })
  query?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Окно',
    canBePort: true,
    isPort: true,
  })
  timeWindow?: TimeWindow;
}

class FindEvidenceOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Записи' })
  records!: Evidence[];
}

@Executor<FindEvidenceIn, FindEvidenceOut>({
  nodeType: 'plugin.rag.find.evidence',
  name: 'RAG: найти evidence',
  description:
    'Чтение Evidence S0 по тексту и окну. Без порта evidence — из стора коллекции.',
  help: helpEvidence,
  pluginId: 'rag',
  inputs: FindEvidenceIn,
  outputs: FindEvidenceOut,
  transport,
})
export class RagFindEvidenceExecutor {
  async execute(ctx: ExecContext<FindEvidenceIn>): Promise<FindEvidenceOut> {
    const fromPort = fromJsonPort(ctx.inputs.evidence, [] as Evidence[]);
    const evidence =
      fromPort.length > 0
        ? fromPort
        : await getRagServices().knowledge.listEvidence(ctx.inputs.collectionId);
    const result = findEvidence({
      collectionId: ctx.inputs.collectionId,
      evidence,
      query: ctx.inputs.query,
      timeWindow: fromJsonPort(ctx.inputs.timeWindow, undefined),
      limit: ctx.inputs.limit,
    });
    return { records: toJsonPort(result.records) as never };
  }
}

class InspectHistoryIn {
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
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Лимит',
    static: true,
    default: 50,
  })
  limit?: number;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Claims',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  claims!: Claim[];

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Субъект',
    canBePort: true,
    isPort: true,
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
}

class InspectHistoryOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Записи' })
  records!: Claim[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence IDs' })
  evidenceIds!: string[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Альтернативы' })
  alternatives!: unknown[];
}

@Executor<InspectHistoryIn, InspectHistoryOut>({
  nodeType: 'plugin.rag.inspect.history',
  name: 'RAG: история claim',
  description: 'История subject+predicate со статусами и alternatives.',
  help: helpInspect,
  pluginId: 'rag',
  inputs: InspectHistoryIn,
  outputs: InspectHistoryOut,
  transport,
})
export class RagInspectHistoryExecutor {
  async execute(ctx: ExecContext<InspectHistoryIn>): Promise<InspectHistoryOut> {
    const result = inspectHistory({
      collectionId: ctx.inputs.collectionId,
      claims: fromJsonPort(ctx.inputs.claims, []),
      subject: ctx.inputs.subject,
      predicate: ctx.inputs.predicate,
      limit: ctx.inputs.limit,
    });
    return {
      records: toJsonPort(result.records) as never,
      evidenceIds: toJsonPort(result.evidenceIds) as never,
      alternatives: toJsonPort(result.alternatives) as never,
    };
  }
}

class ComparePeriodsIn {
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
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Лимит',
    static: true,
    default: 50,
  })
  limit?: number;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Claims',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  claims!: Claim[];

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Субъект',
    canBePort: true,
    isPort: true,
  })
  subject?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Предикат',
    canBePort: true,
    isPort: true,
  })
  predicate?: string;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Окно A',
    canBePort: true,
    isPort: true,
    required: true,
  })
  windowA!: TimeWindow;

  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Окно B',
    canBePort: true,
    isPort: true,
    required: true,
  })
  windowB!: TimeWindow;
}

class ComparePeriodsOut {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Период A' })
  periodA!: Claim[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Период B' })
  periodB!: Claim[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Evidence IDs' })
  evidenceIds!: string[];
}

@Executor<ComparePeriodsIn, ComparePeriodsOut>({
  nodeType: 'plugin.rag.compare.periods',
  name: 'RAG: сравнить периоды',
  description: 'Два окна времени → два набора claims.',
  help: helpCompare,
  pluginId: 'rag',
  inputs: ComparePeriodsIn,
  outputs: ComparePeriodsOut,
  transport,
})
export class RagComparePeriodsExecutor {
  async execute(ctx: ExecContext<ComparePeriodsIn>): Promise<ComparePeriodsOut> {
    const result = comparePeriods({
      collectionId: ctx.inputs.collectionId,
      claims: fromJsonPort(ctx.inputs.claims, []),
      subject: ctx.inputs.subject,
      predicate: ctx.inputs.predicate,
      windowA: fromJsonPort(ctx.inputs.windowA, {}),
      windowB: fromJsonPort(ctx.inputs.windowB, {}),
      limit: ctx.inputs.limit,
    });
    return {
      periodA: toJsonPort(result.periodA) as never,
      periodB: toJsonPort(result.periodB) as never,
      evidenceIds: toJsonPort(result.evidenceIds) as never,
    };
  }
}
