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

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'URL события',
    description: 'eventUrl из listEvents',
    isPrimary: true,
    canBePort: true,
    isPort: true,
  })
  eventUrl!: string;
}

class OutputDto {
  @FieldDecorator({ type: 'string', label: 'Статус' })
  status!: string;

  @FieldDecorator({ type: 'textarea', label: 'Событие (JSON)' })
  eventJson!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.caldav.getEvent',
  name: 'CalDAV: событие',
  description: 'Читает событие по eventUrl.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'caldav',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CaldavGetEventExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const event = await caldavFromInputs(
      resolveCaldavConfig(ctx.inputs as unknown as Record<string, unknown>),
    ).getEvent(ctx.inputs.eventUrl);
    if (!event) {
      return { status: 'not_found', eventJson: '' };
    }
    return { status: 'found', eventJson: JSON.stringify(event) };
  }
}
