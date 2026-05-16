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

  @IsOptional()
  @FieldDecorator({
    type: 'number',
    label: 'ID проекта',
    description: 'project_id — фильтр по проекту',
    canBePort: true,
    isPort: true,
  })
  projectId?: number;

  @IsOptional()
  @FieldDecorator({
    type: 'number',
    label: 'ID статуса',
    description: 'status_id — open, closed, * или число',
    canBePort: true,
    isPort: true,
  })
  statusId?: number | string;

  @IsOptional()
  @FieldDecorator({
    type: 'number',
    label: 'Исполнитель',
    description: 'assigned_to_id — или "me" для текущего пользователя',
    canBePort: true,
    isPort: true,
  })
  assignedToId?: number | string;

  @IsOptional()
  @FieldDecorator({
    type: 'number',
    label: 'Трекер',
    description: 'tracker_id',
    canBePort: true,
    isPort: true,
  })
  trackerId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Limit',
    description: 'Число записей (по умолчанию 25, макс 100)',
    canBePort: true,
    isPort: true,
  })
  limit?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Offset',
    description: 'Смещение для пагинации',
    canBePort: true,
    isPort: true,
  })
  offset?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Include',
    description: 'Связанные данные: attachments, relations',
    canBePort: true,
    isPort: true,
  })
  include?: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Sort',
    description: 'Сортировка, например: updated_on:desc',
    canBePort: true,
    isPort: true,
  })
  sort?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Issues',
    description: 'Список задач',
  })
  issues?: Record<string, unknown>[];

  @FieldDecorator({
    type: 'number',
    label: 'Total count',
    description: 'Общее количество задач',
  })
  totalCount?: number;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.issue.list',
  name: 'Redmine: список задач',
  description:
    'Получает список issues с фильтрацией (проект, статус, исполнитель и т.д.).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineListIssuesExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const {
      baseUrl,
      apiKey,
      projectId,
      statusId,
      assignedToId,
      trackerId,
      limit,
      offset,
      include,
      sort,
    } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const query: Record<string, string | number | undefined> = {};
    if (projectId != null) query.project_id = projectId;
    if (statusId != null) query.status_id = String(statusId);
    if (assignedToId != null) query.assigned_to_id = String(assignedToId);
    if (trackerId != null) query.tracker_id = trackerId;
    if (limit != null) query.limit = limit;
    if (offset != null) query.offset = offset;
    if (include) query.include = include;
    if (sort) query.sort = sort;

    const { data, status, text } = await client.get<{
      issues?: Record<string, unknown>[];
      total_count?: number;
    }>('/issues.json', query);

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      issues: data?.issues ?? [],
      totalCount: data?.total_count,
      status: 'ok',
    };
  }
}
