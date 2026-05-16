import { IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { OllamaHttpService } from './ollama.service';

class InputDto {
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

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Модель',
    description: 'Имя модели (llama3, gemma3, mistral, qwen2 и т.д.)',
  })
  model!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Base URL',
    description: 'Адрес Ollama (по умолчанию http://localhost:11434)',
    default: 'http://localhost:11434',
  })
  baseUrl?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'string',
    label: 'Текст',
    description: 'Сгенерированный текст ответа',
  })
  text?: string;

  @FieldDecorator({
    type: 'string',
    label: 'Сырой ответ',
    description: 'Полный raw-ответ',
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
    description: 'stop, length и т.д.',
  })
  finishReason?: string;

  @FieldDecorator({
    type: 'keyvalue',
    label: 'Использование',
    description: 'promptEvalCount, evalCount, totalDuration',
  })
  usage?: {
    promptEvalCount?: number;
    evalCount?: number;
    totalDuration?: number;
  };
}

@Executor<InputDto, OutputDto>({
  nodeType: 'llm.ollama.generate',
  name: 'Ollama: генерация',
  description:
    'Вызывает локальный Ollama API. Поддерживает множество моделей (llama3, gemma3, mistral и др.). Base URL настраивается (по умолчанию localhost:11434).',
  help: loadHelpFromFile(__dirname),
  pluginId: 'llm',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class LlmOllamaGenerateExecutor {
  private readonly ollama = new OllamaHttpService();

  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { systemPrompt, userPrompt, model, baseUrl } = ctx.inputs;
    const resolvedBaseUrl =
      baseUrl?.trim() ||
      process.env.OLLAMA_BASE_URL?.trim() ||
      `http://${process.env.OLLAMA_HOST ?? 'localhost'}:${process.env.OLLAMA_PORT ?? 11434}`;

    const completion = await this.ollama.generateText({
      baseUrl: resolvedBaseUrl,
      model,
      systemPrompt,
      userPrompt,
    });

    const resolvers: Record<string, () => unknown> = {
      text: () => completion.text,
      raw: () => completion.rawText,
      usage: () =>
        completion.promptEvalCount !== undefined ||
        completion.evalCount !== undefined ||
        completion.totalDuration !== undefined
          ? {
              promptEvalCount: completion.promptEvalCount,
              evalCount: completion.evalCount,
              totalDuration: completion.totalDuration,
            }
          : undefined,
      model: () => completion.model ?? model,
      finishReason: () => completion.doneReason,
    };

    return (ctx.outputs ?? []).reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = resolvers[key]?.() ?? undefined;
      return acc;
    }, {}) as OutputDto;
  }
}
