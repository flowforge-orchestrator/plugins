import { IsEnum, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';

/**
 * 1) InputDto definition
 */
export enum OpenAIModel {
  GPT_4O_MINI = 'gpt-4o-mini',
  GPT_4O = 'gpt-4o',
}

export class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Системный промпт',
    description: 'Инструкции для модели (роль, стиль, ограничения)',
  })
  systemPrompt!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Пользовательский промпт',
    description: 'Основной запрос к модели',
  })
  userPrompt!: string;

  @IsEnum(OpenAIModel)
  @FieldDecorator({
    type: 'select',
    label: 'Модель',
    description: 'Модель OpenAI (gpt-4o-mini, gpt-4o)',
  })
  model!: OpenAIModel;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ',
    description: 'Ключ доступа к OpenAI API',
    static: true,
    secretKind: 'OPENAI_API_KEY',
  })
  apiKey!: string;
}

/**
 * 2) OutputDto definition
 */
export class OutputDto {
  @FieldDecorator({
    type: 'string',
    label: 'Текст',
    description: 'Сгенерированный текст ответа',
  })
  text?: string;
  @FieldDecorator({
    type: 'string',
    label: 'Сырой ответ',
    description: 'Полный raw-ответ API',
  })
  raw?: string;
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    description: 'Использованная модель',
  })
  model?: string;
  @FieldDecorator({
    type: 'string',
    label: 'Причина завершения',
    description: 'stop, length, content_filter и т.д.',
  })
  finishReason?: string;
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Использование токенов',
    description: 'Число входных, выходных и общих токенов',
  })
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

/**
 * 4) External dependency (service stub) — OpenAI via fetch (без SDK).
 */
type OpenAIResponsesApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type OpenAIResponsesApiOutputContent =
  | { type: 'output_text'; text?: string }
  | { type: string; text?: string; [k: string]: unknown };

type OpenAIResponsesApiOutputItem = {
  type?: string;
  role?: string;
  content?: OpenAIResponsesApiOutputContent[];
  finish_reason?: string;
  [k: string]: unknown;
};

type OpenAIResponsesApiResponse = {
  id?: string;
  model?: string;
  output?: OpenAIResponsesApiOutputItem[];
  usage?: OpenAIResponsesApiUsage;
  [k: string]: unknown;
};

export class OpenAIHttpService {
  private readonly endpoint = 'https://api.openai.com/v1/responses';

  async generateText(params: {
    model: OpenAIModel;
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
  }): Promise<{
    text: string;
    rawText: string;
    model?: string;
    finishReason?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }> {
    if (!params.apiKey) throw new Error('OPENAI_API_KEY is not set');

    // Placeholders — you can fill later
    const orgId = process.env.OPENAI_ORG_ID;
    const projectId = process.env.OPENAI_PROJECT_ID;

    const formatGuard = [
      'ВАЖНО:',
      '- Отвечай ТОЛЬКО итоговым текстом ответа.',
      '- Не добавляй пояснений, дисклеймеров, вступлений, заголовков.',
      '- Не используй Markdown, JSON, списки с буллетами, если это не требуется пользователем напрямую.',
      '- Не включай префиксы вроде "Ответ:", "Результат:", "Конечно".',
      '- Если запрос некорректен или недостаточно данных — верни пустую строку.',
    ].join('\n');

    const system = `${params.systemPrompt}\n\n${formatGuard}`;

    const body = {
      model: params.model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        {
          role: 'user',
          content: [{ type: 'input_text', text: params.userPrompt }],
        },
      ],
    };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (orgId) headers['OpenAI-Organization'] = orgId;
    if (projectId) headers['OpenAI-Project'] = projectId;

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `OpenAI Responses API error: ${res.status} ${res.statusText}${errText ? ` - ${errText}` : ''}`,
      );
    }

    const json = (await res.json()) as OpenAIResponsesApiResponse;
    const { text, finishReason } = this.extractTextAndFinishReason(json);

    return {
      text: text.trim(),
      rawText: text,
      model: json.model,
      finishReason,
      usage: json.usage
        ? {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
    };
  }

  private extractTextAndFinishReason(json: OpenAIResponsesApiResponse): {
    text: string;
    finishReason?: string;
  } {
    const output = Array.isArray(json.output) ? json.output : [];
    let finishReason: string | undefined;
    const chunks: string[] = [];

    for (const item of output) {
      if (!finishReason && typeof item?.finish_reason === 'string')
        finishReason = item.finish_reason;

      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') {
          chunks.push(part.text);
        } else if (typeof part?.text === 'string') {
          chunks.push(part.text);
        }
      }
    }

    return { text: chunks.join(''), finishReason };
  }
}

/**
 * 3) Executor class
 */
@Executor<InputDto, OutputDto>({
  nodeType: 'llm.openai.generate',
  name: 'Обращение к OpenAI API',
  description:
    'Вызывает OpenAI Responses API с системным и пользовательским промптами и возвращает текст ответа (и опционально метаданные).',
  help: loadHelpFromFile(__dirname),
  pluginId: 'llm',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class LlmOpenAiGenerateExecutor {
  private readonly openai = new OpenAIHttpService();

  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { systemPrompt, userPrompt, model, apiKey } = ctx.inputs;

    const completion = await this.openai.generateText({
      systemPrompt,
      userPrompt,
      model,
      apiKey,
    });

    // "key -> value" resolver map
    const resolvers: Record<string, () => unknown> = {
      text: () => completion.text,
      raw: () => completion.rawText,
      usage: () => completion.usage,
      model: () => completion.model ?? model,
      finishReason: () => completion.finishReason,
    };

    return (ctx.outputs ?? []).reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = resolvers[key]?.() ?? undefined;
      return acc;
    }, {}) as OutputDto;
  }
}
