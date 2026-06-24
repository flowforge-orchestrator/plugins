import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
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

  @IsISO8601()
  @FieldDecorator({
    type: 'string',
    label: 'Начало периода',
    description: 'ISO-8601, например 2026-06-01T00:00:00',
    isPrimary: true,
    canBePort: true,
    isPort: true,
  })
  startDate!: string;

  @IsISO8601()
  @FieldDecorator({
    type: 'string',
    label: 'Конец периода',
    description: 'ISO-8601; события, пересекающиеся с [start, end)',
    canBePort: true,
    isPort: true,
  })
  endDate!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'URL календаря',
    description: 'Из listCalendars; пусто — все календари',
    canBePort: true,
    isPort: true,
  })
  calendarUrl?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Имя календаря',
    description: 'Альтернатива URL; пусто — все календари',
    canBePort: true,
    isPort: true,
  })
  calendarName?: string;
}

class OutputDto {
  @FieldDecorator({ type: 'number', label: 'Количество' })
  count!: number;

  @FieldDecorator({
    type: 'textarea',
    label: 'События (JSON)',
  })
  eventsJson!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.caldav.listEvents',
  name: 'CalDAV: список событий',
  description: 'События за период (пересечение с интервалом).',
  help: loadHelpFromFile(__dirname),
  pluginId: 'caldav',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CaldavListEventsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const client = caldavFromInputs(
      resolveCaldavConfig(ctx.inputs as unknown as Record<string, unknown>),
    );
    const events = await client.listEvents({
      startIso: ctx.inputs.startDate,
      endIso: ctx.inputs.endDate,
      calendarUrl: ctx.inputs.calendarUrl,
      calendarName: ctx.inputs.calendarName,
    });
    return {
      count: events.length,
      eventsJson: JSON.stringify(events),
    };
  }
}
