import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import help from './help.md';
import { getHistory } from '../history.logic';
import { getHistoryStore } from '../store';

class InputDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @FieldDecorator({
    type: 'number',
    label: 'ID',
    description: 'Ключ строки из списка или записи',
    canBePort: true,
    isPort: true,
  })
  id?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Chat ID',
    canBePort: true,
    isPort: true,
  })
  chatId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Message ID',
    canBePort: true,
    isPort: true,
  })
  messageId?: string;
}

class OutputDto {
  @FieldDecorator({ type: 'number', label: 'ID' })
  id!: number;

  @FieldDecorator({ type: 'string', label: 'Chat ID' })
  chatId!: string;

  @FieldDecorator({ type: 'string', label: 'Message ID' })
  messageId!: string;

  @FieldDecorator({ type: 'string', label: 'Update ID' })
  updateId!: string;

  @FieldDecorator({ type: 'string', label: 'Направление' })
  direction!: string;

  @FieldDecorator({ type: 'string', label: 'Тип' })
  kind!: string;

  @FieldDecorator({ type: 'string', label: 'Текст' })
  text!: string;

  @FieldDecorator({ type: 'string', label: 'From ID' })
  fromId!: string;

  @FieldDecorator({ type: 'string', label: 'Username' })
  fromUsername!: string;

  @FieldDecorator({ type: 'string', label: 'Имя' })
  fromFirstName!: string;

  @FieldDecorator({ type: 'string', label: 'Thread ID' })
  messageThreadId!: string;

  @FieldDecorator({ type: 'string', label: 'Reply message ID' })
  replyToMessageId!: string;

  @FieldDecorator({ type: 'string', label: 'Reply text' })
  replyToText!: string;

  @FieldDecorator({ type: 'string', label: 'Тип чата' })
  chatType!: string;

  @FieldDecorator({ type: 'string', label: 'Название чата' })
  chatTitle!: string;

  @FieldDecorator({ type: 'number', label: 'Дата' })
  date!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.telegram.history.get',
  name: 'Telegram: сообщение из истории',
  description:
    'Одна запись по id либо по паре chatId и messageId (самая поздняя).',
  help,
  pluginId: 'telegram',
  sectionPath: ['history'],
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class TelegramHistoryGetExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return getHistory(getHistoryStore(), ctx.inputs);
  }
}
