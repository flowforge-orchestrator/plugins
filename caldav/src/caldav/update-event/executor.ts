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

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'URL события',
    isPrimary: true,
    canBePort: true,
    isPort: true,
  })
  eventUrl!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Название',
    canBePort: true,
    isPort: true,
  })
  summary?: string;

  @IsOptional()
  @IsISO8601()
  @FieldDecorator({
    type: 'string',
    label: 'Начало',
    canBePort: true,
    isPort: true,
  })
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  @FieldDecorator({
    type: 'string',
    label: 'Конец',
    canBePort: true,
    isPort: true,
  })
  endDate?: string;

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
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.caldav.updateEvent',
  name: 'CalDAV: изменить событие',
  description: 'Обновляет событие по eventUrl (нужно хотя бы одно поле).',
  help: loadHelpFromFile(__dirname),
  pluginId: 'caldav',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CaldavUpdateEventExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const i = ctx.inputs;
    if (
      !i.summary &&
      !i.startDate &&
      !i.endDate &&
      i.description === undefined &&
      i.location === undefined &&
      i.allDay === undefined
    ) {
      throw new Error('updateEvent: at least one field to change is required');
    }
    await caldavFromInputs(
      resolveCaldavConfig(ctx.inputs as unknown as Record<string, unknown>),
    ).updateEvent({
      eventUrl: i.eventUrl,
      summary: i.summary,
      startIso: i.startDate,
      endIso: i.endDate,
      description: i.description,
      location: i.location,
      allDay: i.allDay,
    });
    return { status: 'updated' };
  }
}
