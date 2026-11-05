import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import help from './help.md';
import { appendHistory } from '../history.logic';
import { getHistoryStore } from '../store';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Chat ID',
    description: 'Чат, к которому относится запись',
    isPrimary: true,
    canBePort: true,
    isPort: true,
    required: true,
  })
  chatId!: string;

  @IsString()
  @IsIn(['in', 'out'])
  @FieldDecorator({
    type: 'string',
    label: 'Направление',
    description: 'in — входящее, out — исходящее',
    canBePort: true,
    isPort: true,
    required: true,
  })
  direction!: 'in' | 'out';

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Message ID',
    canBePort: true,
    isPort: true,
  })
  messageId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Update ID',
    description: 'Повтор с тем же update_id не создаёт вторую строку',
    canBePort: true,
    isPort: true,
  })
  updateId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Тип',
    description: 'message, edited_message, callback_query и т.д.',
    canBePort: true,
    isPort: true,
  })
  kind?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст',
    canBePort: true,
    isPort: true,
  })
  text?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'From ID',
    canBePort: true,
    isPort: true,
  })
  fromId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Username',
    canBePort: true,
    isPort: true,
  })
  fromUsername?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Имя',
    canBePort: true,
    isPort: true,
  })
  fromFirstName?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Thread ID',
    canBePort: true,
    isPort: true,
  })
  messageThreadId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Reply message ID',
    canBePort: true,
    isPort: true,
  })
  replyToMessageId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Reply text',
    canBePort: true,
    isPort: true,
  })
  replyToText?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Тип чата',
    canBePort: true,
    isPort: true,
  })
  chatType?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Название чата',
    canBePort: true,
    isPort: true,
  })
  chatTitle?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Дата',
    description: 'Unix-секунды. Пусто — время записи',
    canBePort: true,
    isPort: true,
  })
  date?: number;
}

class OutputDto {
  @FieldDecorator({ type: 'number', label: 'ID' })
  id!: number;

  @FieldDecorator({ type: 'string', label: 'Chat ID' })
  chatId!: string;

  @FieldDecorator({ type: 'string', label: 'Message ID' })
  messageId!: string;

  @FieldDecorator({
    type: 'boolean',
    label: 'Создано',
    description: 'false, если запись с этим update_id уже была',
  })
  created!: boolean;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.telegram.history.append',
  name: 'Telegram: записать историю',
  description:
    'Добавляет одно сообщение в локальную историю бота. Повтор того же update_id не дублирует строку.',
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
export class TelegramHistoryAppendExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return appendHistory(getHistoryStore(), ctx.inputs);
  }
}
