import {
  Allow,
  IsInt,
  IsNumber,
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
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { getRagServices } from '../adapters/services';
import { toJsonPort } from '../internal/json-port';
import { normalizeObservations } from '../agent/turn/agent.turn.logic';
import {
  isEnabledFlag,
  mergeObservations,
  shouldRunForAction,
} from '../internal/observations-merge';
import { normalizeMode } from '../research/model';
import {
  buildFrameSystemPrompt,
  buildFrameUserPrompt,
  fallbackFrame,
  parseFramePayload,
} from './topic.logic';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Сообщение',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  message!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'История',
    canBePort: true,
    isPort: true,
  })
  history?: string;

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
    description: 'Если задан и не topic — passthrough observations',
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
    label: 'API ключ LLM',
    static: true,
    secretKind: 'OPENAI_API_KEY',
  })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM model', static: true })
  llmModel?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'LLM base URL', static: true })
  llmBaseUrl?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({ type: 'number', label: 'Temperature', static: true })
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({ type: 'number', label: 'Max tokens', static: true })
  maxTokens?: number;
}

class OutputDto {
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Frame JSON' })
  frame!: string;

  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'skipRetrieval',
    description: '"true" | "false"',
  })
  skipRetrieval!: string;

  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'population',
    description: 'collection | named | none',
  })
  population!: string;

  @Allow()
  @FieldDecorator({
    type: 'string',
    label: 'mode',
    description: 'direct | retrieval | analysis | research',
  })
  mode!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Observations' })
  observations!: string;

  @Allow()
  @IsOptional()
  skipped?: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.topic',
  name: 'RAG: рамка вопроса',
  description:
    'Охват (вся коллекция, названный документ, вне корпуса), слоты ответа и сущность. Пишет модель.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagTopicExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    if (
      !isEnabledFlag(ctx.inputs.enabled) ||
      !shouldRunForAction(ctx.inputs.action, 'topic')
    ) {
      const obs = normalizeObservations(ctx.inputs.observations);
      const { observationsJson } = mergeObservations(obs, {});
      return {
        frame: obs.frame ? toJsonPort(obs.frame) : '',
        skipRetrieval: obs.frame?.skipRetrieval ? 'true' : 'false',
        population: obs.frame?.population ?? '',
        mode: obs.task?.mode ?? '',
        observations: observationsJson,
        skipped: true,
      };
    }

    let frame = fallbackFrame(ctx.inputs.message);
    let mode = frame.skipRetrieval ? 'direct' : 'retrieval';
    if (!frame.skipRetrieval) {
      try {
        const services = getRagServices();
        const payload = await services.llm.completeJson<unknown>({
          apiKey: ctx.inputs.apiKey ?? '',
          model: ctx.inputs.llmModel,
          baseUrl: ctx.inputs.llmBaseUrl,
          temperature: ctx.inputs.temperature,
          maxTokens: ctx.inputs.maxTokens,
          runId: ctx.runId,
          systemPrompt: buildFrameSystemPrompt(),
          userPrompt: buildFrameUserPrompt({
            message: ctx.inputs.message,
            history: ctx.inputs.history,
          }),
        });
        frame = parseFramePayload(payload);
        mode = frame.skipRetrieval
          ? 'direct'
          : normalizeMode(
              payload && typeof payload === 'object'
                ? (payload as { mode?: unknown }).mode
                : undefined,
              'retrieval',
            );
      } catch {
        // fallback frame: retrieval proceeds, no slots
      }
    }
    const task = {
      question: ctx.inputs.message,
      mode: mode as 'direct' | 'retrieval' | 'analysis' | 'research',
      requiredInformation: frame.slots,
      unresolvedQuestions: [] as string[],
    };
    const { observationsJson } = mergeObservations(
      ctx.inputs.observations,
      { frame, task },
      'frame',
    );
    return {
      frame: toJsonPort(frame),
      skipRetrieval: frame.skipRetrieval ? 'true' : 'false',
      population: frame.population,
      mode,
      observations: observationsJson,
    };
  }
}
