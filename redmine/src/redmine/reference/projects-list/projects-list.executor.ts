import { IsOptional, IsString, MinLength } from 'class-validator';
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

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Include',
    description:
      'Связанные данные: trackers, issue_categories, enabled_modules',
    canBePort: true,
    isPort: true,
  })
  include?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Projects',
    description: 'Список проектов',
  })
  projects?: Record<string, unknown>[];

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.projects.list',
  name: 'Redmine: список проектов',
  description: 'Получает список проектов (публичные и доступные пользователю).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineProjectsListExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey, include } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const query: Record<string, string | number | undefined> = {};
    if (include) query.include = include;

    const { data, status, text } = await client.get<{
      projects?: Record<string, unknown>[];
    }>('/projects.json', Object.keys(query).length ? query : undefined);

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      projects: data?.projects ?? [],
      status: 'ok',
    };
  }
}
