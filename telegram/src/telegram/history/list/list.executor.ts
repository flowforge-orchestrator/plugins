import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import help from './help.md';
import { listHistory } from '../history.logic';
import { getHistoryStore } from '../store';

class InputDto {
  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Chat ID',
    description: 'Равенство. Пусто — без фильтра',
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
  @IsIn(['in', 'out'])
  @FieldDecorator({
    type: 'string',
    label: 'Направление',
    description: 'in или out',
    canBePort: true,
    isPort: true,
  })
  direction?: 'in' | 'out';

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Тип',
    canBePort: true,
    isPort: true,
  })
  kind?: string;

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
    type: 'string',
    label: 'Update ID',
    canBePort: true,
    isPort: true,
  })
  updateId?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Текст',
    description: 'Точное совпадение',
    canBePort: true,
    isPort: true,
  })
  text?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Текст содержит',
    canBePort: true,
    isPort: true,
  })
  textContains?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'С',
    description: 'Unix-секунды, включительно',
    canBePort: true,
    isPort: true,
  })
  since?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'По',
    description: 'Unix-секунды, включительно',
    canBePort: true,
    isPort: true,
  })
  until?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @FieldDecorator({
    type: 'number',
    label: 'Offset',
    description: 'Сколько записей пропустить',
    canBePort: true,
    isPort: true,
    default: 0,
  })
  offset?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @FieldDecorator({
    type: 'number',
    label: 'Limit',
    canBePort: true,
    isPort: true,
    default: 20,
  })
  limit?: number;

  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest'])
  @FieldDecorator({
    type: 'string',
    label: 'Порядок',
    description: 'newest или oldest',
    canBePort: true,
    isPort: true,
    default: 'newest',
  })
  order?: 'newest' | 'oldest';
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Сообщения',
    description: 'Страница записей истории',
  })
  messages!: unknown[];

  @FieldDecorator({ type: 'number', label: 'Всего' })
  total!: number;

  @FieldDecorator({ type: 'number', label: 'Offset' })
  offset!: number;

  @FieldDecorator({ type: 'number', label: 'Limit' })
  limit!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.telegram.history.list',
  name: 'Telegram: список сообщений',
  description:
    'Страница локальной истории. Каждый заполненный порт — фильтр равенства, кроме «текст содержит», диапазона дат, offset и limit.',
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
export class TelegramHistoryListExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return listHistory(getHistoryStore(), ctx.inputs);
  }
}
