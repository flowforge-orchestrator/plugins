import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  ExecContext,
  Executor,
  FieldDecorator,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../getUrlFromEnv';
import { caldavFromInputs } from '../caldav-client';
import { resolveCaldavConfig } from '../resolve-caldav-config';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'CalDAV URL',
    description:
      'Базовый URL (например https://nextcloud.example.com/remote.php/dav)',
    required: true,
    static: true,
  })
  caldavUrl!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Логин',
    required: true,
    static: true,
  })
  username!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'Пароль',
    required: true,
    static: true,
  })
  password!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'URL календаря',
    description: 'Из listCalendars; если пусто — первый календарь',
    canBePort: true,
    isPort: true,
  })
  calendarUrl?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Имя календаря',
    canBePort: true,
    isPort: true,
  })
  calendarName?: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Название',
    isPrimary: true,
    canBePort: true,
    isPort: true,
  })
  summary!: string;

  @IsISO8601()
  @FieldDecorator({
    type: 'string',
    label: 'Начало',
    description: 'ISO-8601',
    canBePort: true,
    isPort: true,
  })
  startDate!: string;

  @IsISO8601()
  @FieldDecorator({
    type: 'string',
    label: 'Конец',
    description: 'ISO-8601',
    canBePort: true,
    isPort: true,
  })
  endDate!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Описание',
    canBePort: true,
    isPort: true,
  })
  description?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Место',
    canBePort: true,
    isPort: true,
  })
  location?: string;

  @IsOptional()
  @IsBoolean()
  @FieldDecorator({
    type: 'boolean',
    label: 'Весь день',
    canBePort: true,
    isPort: true,
  })
  allDay?: boolean;
}

class OutputDto {
  @FieldDecorator({ type: 'string', label: 'Статус' })
  status!: string;

  @FieldDecorator({ type: 'string', label: 'UID' })
  eventId!: string;

  @FieldDecorator({ type: 'string', label: 'URL события' })
  eventUrl!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.caldav.createEvent',
  name: 'CalDAV: создать событие',
  description: 'Создаёт VEVENT в выбранном или первом календаре.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'caldav',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CaldavCreateEventExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const created = await caldavFromInputs(
      resolveCaldavConfig(ctx.inputs as unknown as Record<string, unknown>),
    ).createEvent({
      calendarUrl: ctx.inputs.calendarUrl,
      calendarName: ctx.inputs.calendarName,
      summary: ctx.inputs.summary,
      startIso: ctx.inputs.startDate,
      endIso: ctx.inputs.endDate,
      description: ctx.inputs.description,
      location: ctx.inputs.location,
      allDay: ctx.inputs.allDay,
    });
    return {
      status: 'created',
      eventId: created.uid,
      eventUrl: created.eventUrl,
    };
  }
}
