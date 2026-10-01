import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import help from './help.md';
import { publicationPullEndpointFromEnv } from '../getUrlFromEnv';
import { getRagServices } from '../adapters/services';
import {
  buildAnswerSystemPrompt,
  buildAnswerUserPrompt,
  normalizeHistory,
  parseAnswerPayload,
} from './answer.logic';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Вопрос',
    canBePort: true,
    isPort: true,
    isPrimary: true,
    required: true,
  })
  message!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Контекст',
    description: 'Собранный текст из поиска (plugin.rag.search.query → context)',
    canBePort: true,
    isPort: true,
    required: true,
  })
  context!: string;

  @IsOptional()
  @Allow()
  @FieldDecorator({
    type: 'textarea',
    label: 'История диалога',
    description: 'JSON-массив {role,text} предыдущих реплик (без текущего вопроса)',
    canBePort: true,
    isPort: true,
  })
  history?: string;

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
  @FieldDecorator({ type: 'textarea', label: 'Ответ' })
  answer!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.rag.answer',
  name: 'RAG: ответ LLM',
  description:
    'Генерирует ответ пользователю по контексту поиска и истории диалога (без прямого доступа к корпусу).',
  help,
  pluginId: 'rag',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RagAnswerExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const services = getRagServices();
    const history = normalizeHistory(ctx.inputs.history);
    const payload = await services.llm.completeJson<unknown>({
      apiKey: ctx.inputs.apiKey ?? '',
      systemPrompt: buildAnswerSystemPrompt(),
      userPrompt: buildAnswerUserPrompt({
        message: ctx.inputs.message,
        context: ctx.inputs.context,
        history,
      }),
    });
    return { answer: parseAnswerPayload(payload) };
  }
}
