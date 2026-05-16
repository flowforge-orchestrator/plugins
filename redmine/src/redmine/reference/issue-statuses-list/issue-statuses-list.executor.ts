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
    label: 'Issue statuses',
    description: 'Список статусов (New, In Progress, Closed и т.д.)',
  })
  issueStatuses?: Record<string, unknown>[];

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.issue-statuses.list',
  name: 'Redmine: список статусов',
  description:
    'Получает список статусов задач (New, In Progress, Closed и т.д.).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineIssueStatusesListExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const { data, status, text } = await client.get<{
      issue_statuses?: Record<string, unknown>[];
    }>('/issue_statuses.json');

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      issueStatuses: data?.issue_statuses ?? [],
      status: 'ok',
    };
  }
}
