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
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { getRagServices } from '../../adapters/services';
import { toJsonPort } from '../../internal/json-port';
import {
  chatMetricsSnapshot,
  noteChatQuestion,
  noteChatTurn,
} from '../../internal/chat-metrics';
import type { Citation } from '../../contracts/types';
import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  normalizeAtoms,
  normalizeObservations,
  normalizeToolSchemas,
  parseAgentTurn,
  type AgentTurnLlmPayload,
} from './agent.turn.logic';
import { normalizeStrategy } from './planning';
import {
  historyWithToolResult,
  observationsFromHistory,
} from './history-state';
import { normalizeHypotheses, normalizeQueue } from '../../research/model';
import { planStep } from '../../research/step.logic';
import { isEnabledFlag } from '../../internal/observations-merge';

const DEFAULT_MAX_ACTIONS = 4;

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Пользовательский промпт',
    description: 'Текст вопроса',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  userPrompt!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'История',
    description: 'Диалог и результат последнего инструмента',
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
    type: 'textarea',
    label: 'Rules',
    description: 'JSON [{id,body}] или текст',
    static: true,
  })
  rules?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Skills',
    description: 'JSON [{id,body}] или текст',
    static: true,
  })
  skills?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'Tools',
    description: 'Карточки с роутера провайдеров',
    canBePort: true,
    isPort: true,
  })
  tools?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Инструкции оператора',
    description: 'Добавляются к собранному промпту. Контракт JSON задаёт код.',
    static: true,
  })
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Стратегия',
    description: 'Вход с узла RAG: стратегия',
    canBePort: true,
    isPort: true,
  })
  strategy?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Max actions per turn',
    static: true,
    default: DEFAULT_MAX_ACTIONS,
  })
  maxActions?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Query tool',
    description: 'Id инструмента, которым retrieval отвечает без планировщика',
    static: true,
    default: 'search',
  })
  queryTool?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Mode',
    description: 'direct | retrieval | analysis | research. Берётся из task, если порт пуст.',
    canBePort: true,
    isPort: true,
  })
  mode?: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'boolean',
    label: 'Enabled',
    description: 'Ветка switch. Пока значение не записано, узел не стартует.',
    canBePort: true,
    isPort: true,
  })
  enabled?: boolean | string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'LLM model',
    static: true,
  })
  llmModel?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'LLM base URL',
    static: true,
  })
  llmBaseUrl?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Temperature',
    static: true,
    default: 0,
  })
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'Max tokens',
    static: true,
  })
  maxTokens?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ LLM',
    static: true,
    secretKind: 'OPENAI_API_KEY',
  })
  apiKey?: string;
}

class OutputDto {
  @Allow()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'op',
    description: 'Одна операция этой итерации. Схема сама вызывает узел с тем же id.',
  })
  op!: string;

  @Allow()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'args' })
  args!: string;

  @Allow()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Действия',
    description: 'Очередь операций, которые схема выполнит на следующих итерациях',
  })
  actions!: string;

  @Allow()
  @IsString()
  @FieldDecorator({ type: 'string', label: 'Запрос' })
  query!: string;

  @Allow()
  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Черновик ответа' })
  answer!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Цитаты' })
  citations?: Citation[];

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'Наблюдения' })
  observations!: string;

  @IsString()
  @FieldDecorator({ type: 'textarea', label: 'Метрики хода' })
  metrics!: string;

  @Allow()
  @FieldDecorator({ type: 'textarea', label: 'История' })
  history!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.agent.turn',
  name: 'RAG: ход агента',
  description:
    'Называет одну следующую операцию. Узлы схемы выполняют её сами. direct и retrieval не зовут модель. retrieval запрашивает следующее поле или сдаёт его.',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagAgentTurnExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const question = ctx.inputs.userPrompt;
    if (!isEnabledFlag(ctx.inputs.enabled)) {
      return {
        op: 'none',
        query: question,
        args: toJsonPort({}),
        actions: toJsonPort([]),
        answer: '',
        citations: [],
        observations: toJsonPort(normalizeObservations(ctx.inputs.observations)),
        metrics: toJsonPort(chatMetricsSnapshot(ctx.runId)),
        history: ctx.inputs.history ?? '[]',
      };
    }
    const services = getRagServices();
    const portObservations = normalizeObservations(ctx.inputs.observations);
    const observations = {
      ...observationsFromHistory(ctx.inputs.history),
      ...portObservations,
      evidence: portObservations.evidence?.length
        ? portObservations.evidence
        : observationsFromHistory(ctx.inputs.history).evidence,
      task: portObservations.task ?? observationsFromHistory(ctx.inputs.history).task,
    };
    const rules = normalizeAtoms(ctx.inputs.rules);
    const skills = normalizeAtoms(ctx.inputs.skills);
    const tools = normalizeToolSchemas(ctx.inputs.tools);
    const strategy = normalizeStrategy(ctx.inputs.strategy);
    const maxActions = Math.max(
      1,
      Number(ctx.inputs.maxActions ?? DEFAULT_MAX_ACTIONS),
    );
    noteChatQuestion(ctx.runId, question);
    noteChatTurn(ctx.runId);

    const mode = ctx.inputs.mode || observations.task?.mode || 'retrieval';
    const allowed = tools.map((tool) => tool.id);
    const queried = (observations.evidence ?? []).filter(
      (item) => item.extractionMethod === 'query' || item.kind === 'derived',
    ).length;
    const required = observations.task?.requiredInformation ?? [];
    const filled = [
      ...new Set(
        (observations.researchClaims ?? [])
          .filter((claim) => claim.status === 'supported' && required.includes(claim.slot))
          .map((claim) => claim.slot),
      ),
    ];
    const asked = [
      ...new Set(
        (observations.evidence ?? []).flatMap((item) =>
          item.group && item.extractionMethod === 'query_attempt' ? [item.group] : [],
        ),
      ),
    ];
    let planned = planStep({
      mode,
      evidenceCount: queried,
      queue: observations.queue ?? [],
      allowed,
      queryTool: ctx.inputs.queryTool || 'search',
      question,
      fields: {
        required,
        filled,
        asked,
        unresolved: observations.task?.unresolvedQuestions ?? [],
      },
    });
    let parsedAnswer = '';
    let citations: ReturnType<typeof parseAgentTurn>['citations'] = [];
    let hypotheses = observations.hypotheses ?? [];
    if (planned.callModel) {
      const payload = await services.llm.completeJson<AgentTurnLlmPayload>({
        apiKey: ctx.inputs.apiKey ?? '',
        model: ctx.inputs.llmModel,
        baseUrl: ctx.inputs.llmBaseUrl,
        temperature: ctx.inputs.temperature,
        maxTokens: ctx.inputs.maxTokens,
        runId: ctx.runId,
        systemPrompt: buildAgentSystemPrompt({
          rules,
          skills,
          tools,
          strategy,
          operatorPrompt: ctx.inputs.systemPrompt,
          maxActions,
        }),
        userPrompt: buildAgentUserPrompt({
          message: question,
          history: ctx.inputs.history,
          observations,
        }),
      });
      const modelSteps = normalizeQueue(payload.actions ?? payload.action);
      planned = planStep({
        mode,
        evidenceCount: queried,
        queue: [],
        allowed,
        queryTool: ctx.inputs.queryTool || 'search',
        question,
        modelSteps: modelSteps.length
          ? modelSteps
          : normalizeQueue(
              payload.action ? [{ id: payload.action, query: payload.query }] : [],
            ),
      });
      const parsed = parseAgentTurn({
        payload,
        observations,
        allowedTools: tools,
        maxActions,
      });
      parsedAnswer = parsed.answer;
      citations = parsed.citations;
      hypotheses = [
        ...hypotheses,
        ...normalizeHypotheses(
          payload && typeof payload === 'object'
            ? (payload as { hypotheses?: unknown }).hypotheses
            : [],
        ),
      ];
    }

    const giveUp = planned.giveUp ?? [];
    const task =
      observations.task && giveUp.length > 0
        ? {
            ...observations.task,
            unresolvedQuestions: [...new Set([...observations.task.unresolvedQuestions, ...giveUp])].slice(
              0,
              8,
            ),
          }
        : observations.task;
    const remembered = {
      ...observations,
      ...(task ? { task } : {}),
      queue: planned.queue,
      hypotheses,
      draftAnswer: parsedAnswer || observations.draftAnswer,
      turnNotes: [
        ...(observations.turnNotes ?? []),
        `op:${planned.op}`,
      ],
    };
    return {
      op: planned.op,
      query: planned.query,
      args: toJsonPort(planned.args),
      actions: toJsonPort(planned.queue),
      answer: parsedAnswer,
      citations,
      observations: toJsonPort(remembered),
      metrics: toJsonPort(chatMetricsSnapshot(ctx.runId)),
      history: historyWithToolResult(ctx.inputs.history, planned.op, remembered),
    };
  }
}
