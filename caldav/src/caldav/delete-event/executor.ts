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
}

class OutputDto {
  @FieldDecorator({ type: 'string', label: 'Статус' })
  status!: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.caldav.deleteEvent',
  name: 'CalDAV: удалить событие',
  description: 'Удаляет событие по eventUrl.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'caldav',
  inputs: InputDto,
  outputs: OutputDto,
  transport: { type: 'tcp', params: publicationPullEndpointFromEnv() },
})
export class CaldavDeleteEventExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    await caldavFromInputs(
      resolveCaldavConfig(ctx.inputs as unknown as Record<string, unknown>),
    ).deleteEvent(ctx.inputs.eventUrl);
    return { status: 'deleted' };
  }
}
