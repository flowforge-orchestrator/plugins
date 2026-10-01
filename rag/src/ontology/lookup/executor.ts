import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
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
import { buildOntologyContext } from './lookup.logic';
import { noteChatTool } from '../../internal/chat-metrics';

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
    type: 'string',
    label: 'Пропустить',
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
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Ontology context' })
  ontologyContext!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Matched entity ids' })
  entityHits!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsOptional()
  skipped?: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.ontology.lookup',
  name: 'RAG: lookup онтологии',
  description: 'Типы схемы и сущности, чьё имя содержит запрос целиком.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagOntologyLookupExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    if (
      !isEnabledFlag(ctx.inputs.enabled) ||
      !shouldRunForAction(ctx.inputs.action, 'ontology')
    ) {
      const obs = normalizeObservations(ctx.inputs.observations);
      const { observationsJson } = mergeObservations(obs, {});
      return {
        ontologyContext: obs.ontologyContext ?? '',
        entityHits: toJsonPort([]),
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
        { ontologyContext: '' },
        'ontology:skip',
      );
      return {
        ontologyContext: '',
        entityHits: toJsonPort([]),
        observations: observationsJson,
      };
    }
    noteChatTool(ctx.runId);
    const services = getRagServices();
    const schema = await services.ontology.loadSchema(ctx.inputs.collectionId);
    const entities = await services.ontology.listEntities(
      ctx.inputs.collectionId,
    );
    const built = buildOntologyContext({
      schema,
      entities,
      query: ctx.inputs.query,
    });
    const { observationsJson } = mergeObservations(
      ctx.inputs.observations,
      { ontologyContext: built.ontologyContext },
      'ontology',
    );
    return {
      ontologyContext: built.ontologyContext,
      entityHits: toJsonPort(built.matchedEntityIds),
      observations: observationsJson,
    };
  }
}
