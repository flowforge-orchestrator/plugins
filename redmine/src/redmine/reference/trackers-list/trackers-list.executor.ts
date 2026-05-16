import { IsString, MinLength } from 'class-validator';
import { ExecContext, Executor, FieldDecorator } from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import help from './help.md';
import { RedmineClient } from '../../client/redmine.client';

class InputDto {
  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Base URL',
    description: 'Адрес Redmine (например: https://redmine.example.com)',
    isPrimary: true,
    canBePort: true,
  })
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'ref',
    label: 'API ключ',
    description: 'X-Redmine-API-Key',
    static: true,
  })
  apiKey!: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Trackers',
    description: 'Список трекеров (Bug, Feature и т.д.)',
  })
  trackers?: Record<string, unknown>[];

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.trackers.list',
  name: 'Redmine: список трекеров',
  description: 'Получает список трекеров (Bug, Feature, Support и т.д.).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineTrackersListExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const { data, status, text } = await client.get<{
      trackers?: Record<string, unknown>[];
    }>('/trackers.json');

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      trackers: data?.trackers ?? [],
      status: 'ok',
    };
  }
}
