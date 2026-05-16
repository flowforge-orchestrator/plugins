import { IsOptional, IsString, MinLength } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';

const RESPONSE_BODY_SNIPPET_MAX_CHARS = 500;

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'Bot Token',
    description: 'Токен бота от BotFather',
    static: true,
  })
  botToken!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Chat ID',
    description: 'ID чата или канала (например: @channel или -1001234567890)',
    isPrimary: true,
    canBePort: true,
  })
  chatId!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст',
    description: 'Сообщение для отправки',
    canBePort: true,
    isPort: true,
  })
  text!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Parse Mode',
    description: 'HTML или Markdown (опционально)',
    canBePort: true,
    isPort: true,
  })
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Результат',
    description: 'Ответ API (message_id, chat, ...)',
  })
  result?: Record<string, unknown>;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

type SendOnceSuccess = {
  readonly success: true;
  readonly payload: Record<string, unknown>;
};
type SendOnceFailure = {
  readonly success: false;
  readonly detail: string;
};
type SendOnceResult = SendOnceSuccess | SendOnceFailure;

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.telegram.send',
  name: 'Telegram: отправить сообщение',
  description:
    'Отправляет сообщение в чат или канал через Bot API. botToken — ref, chatId и text — из портов или конфига.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'telegram',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class TelegramSendExecutor {
  private readonly maxAttempts = 3;
  private readonly retryDelayMs = 3000;

  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { botToken, chatId, text, parseMode } = ctx.inputs;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (parseMode) {
      body.parse_mode = parseMode;
    }
    let lastFailureDetail = '';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const once: SendOnceResult = await this.executeSendOnce(url, body);
      if (once.success) {
        return {
          result: once.payload,
          status: 'ok',
        };
      }
      lastFailureDetail = once.detail;
      if (attempt < this.maxAttempts) {
        await this.delay(this.retryDelayMs);
      }
    }
    throw new Error(
      `Telegram send failed after ${this.maxAttempts} attempts: ${lastFailureDetail}`,
    );
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private async executeSendOnce(
    url: string,
    body: Record<string, unknown>,
  ): Promise<SendOnceResult> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, detail: `fetch failed: ${message}` };
    }
    let responseText: string;
    try {
      responseText = await res.text();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, detail: `read response failed: ${message}` };
    }
    if (!res.ok) {
      const snippet =
        responseText.length > RESPONSE_BODY_SNIPPET_MAX_CHARS
          ? `${responseText.slice(0, RESPONSE_BODY_SNIPPET_MAX_CHARS)}…`
          : responseText;
      return { success: false, detail: `HTTP ${res.status}: ${snippet}` };
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, detail: `invalid JSON response: ${message}` };
    }
    if (data.ok !== true) {
      return {
        success: false,
        detail: `Telegram API error: ${JSON.stringify(data)}`,
      };
    }
    return { success: true, payload: data };
  }
}
