import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
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

  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'ID задачи',
    description: 'ID issue в Redmine',
    canBePort: true,
    isPort: true,
  })
  issueId!: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Include',
    description: 'Связанные данные: journals, attachments, relations, watchers',
    canBePort: true,
    isPort: true,
  })
  include?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Issue',
    description: 'Данные задачи',
  })
  issue?: Record<string, unknown>;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.issue.get',
  name: 'Redmine: получить задачу',
  description: 'Получает issue по ID через REST API.',
  tags: ['redmine', 'issue', 'api', 'rest'],
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineGetIssueExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey, issueId, include } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const query: Record<string, string | number | undefined> = {};
    if (include) query.include = include;

    const { data, status, text } = await client.get<{
      issue?: Record<string, unknown>;
    }>(
      `/issues/${issueId}.json`,
      Object.keys(query).length ? query : undefined,
    );

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      issue: data?.issue as Record<string, unknown>,
      status: 'ok',
    };
  }
}
