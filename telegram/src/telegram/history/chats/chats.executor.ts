import {
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
import { listChats } from '../history.logic';
import { getHistoryStore } from '../store';

class InputDto {
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
    label: 'From ID',
    description: 'Чаты, где есть сообщения этого отправителя',
    canBePort: true,
    isPort: true,
  })
  fromId?: string;

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
    label: 'Название содержит',
    canBePort: true,
    isPort: true,
  })
  titleContains?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'С',
    description: 'Unix-секунды сообщения, включительно',
    canBePort: true,
    isPort: true,
  })
  since?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'По',
    description: 'Unix-секунды сообщения, включительно',
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
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Чаты',
    description: 'chatId, chatType, chatTitle, lastDate, messageCount',
  })
  chats!: unknown[];

  @FieldDecorator({ type: 'number', label: 'Всего' })
  total!: number;

  @FieldDecorator({ type: 'number', label: 'Offset' })
  offset!: number;

  @FieldDecorator({ type: 'number', label: 'Limit' })
  limit!: number;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.telegram.history.chats',
  name: 'Telegram: список чатов',
  description:
    'Чаты из локальной истории: последняя запись и число сообщений. Сортировка по последней дате.',
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
export class TelegramHistoryChatsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    return listChats(getHistoryStore(), ctx.inputs);
  }
}
