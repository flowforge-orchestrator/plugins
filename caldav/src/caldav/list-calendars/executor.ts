import { IsString, MinLength } from 'class-validator';
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
}

class OutputDto {
  @FieldDecorator({ type: 'number', label: 'Количество' })
  count!: number;

  @FieldDecorator({
    type: 'textarea',
    label: 'Календари (JSON)',
    description: '[{ "url", "name" }, …]',
  })
  calendarsJson!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.caldav.listCalendars',
  name: 'CalDAV: список календарей',
  description: 'Список календарей, доступных учётной записи.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'caldav',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CaldavListCalendarsExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const calendars = await caldavFromInputs(
      resolveCaldavConfig(ctx.inputs as unknown as Record<string, unknown>),
    ).listCalendars();
    return {
      count: calendars.length,
      calendarsJson: JSON.stringify(calendars),
    };
  }
}
