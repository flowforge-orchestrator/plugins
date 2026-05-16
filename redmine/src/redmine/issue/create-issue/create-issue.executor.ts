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
  @MinLength(1)
  @FieldDecorator({
    type: 'number',
    label: 'ID проекта',
    description: 'project_id в Redmine',
    canBePort: true,
    isPort: true,
  })
  projectId!: number;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'string',
    label: 'Тема',
    description: 'subject задачи',
    canBePort: true,
    isPort: true,
  })
  subject!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Описание',
    description: 'Описание задачи',
    canBePort: true,
    isPort: true,
  })
  description?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Трекер',
    description: 'tracker_id (опционально)',
    canBePort: true,
    isPort: true,
  })
  trackerId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Приоритет',
    description: 'priority_id (опционально)',
    canBePort: true,
    isPort: true,
  })
  priorityId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Статус',
    description: 'status_id (опционально, по умолчанию Redmine назначит)',
    canBePort: true,
    isPort: true,
  })
  statusId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Исполнитель',
    description: 'assigned_to_id (опционально)',
    canBePort: true,
    isPort: true,
  })
  assignedToId?: number;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Issue',
    description: 'Созданная задача (id, subject, ...)',
  })
  issue?: Record<string, unknown>;

  @FieldDecorator({
    type: 'number',
    label: 'ID',
    description: 'ID созданной задачи',
  })
  id?: number;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.issue.create',
  name: 'Redmine: создать задачу',
  description:
    'Создаёт issue в Redmine по REST API. baseUrl и apiKey настраиваются в конфиге (apiKey — ref).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineCreateIssueExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const {
      baseUrl,
      apiKey,
      projectId,
      subject,
      description,
      trackerId,
      priorityId,
      statusId,
      assignedToId,
    } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const body = {
      issue: {
        project_id: Number(projectId),
        subject,
        ...(description && { description }),
        ...(trackerId && { tracker_id: trackerId }),
        ...(priorityId && { priority_id: priorityId }),
        ...(statusId && { status_id: statusId }),
        ...(assignedToId && { assigned_to_id: assignedToId }),
      },
    };

    const { data, status, text } = await client.post<{
      issue?: { id?: number };
    }>('/issues.json', body);

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    const issue = data?.issue;

    return {
      issue: issue as Record<string, unknown>,
      id: issue?.id,
      status: 'ok',
    };
  }
}
