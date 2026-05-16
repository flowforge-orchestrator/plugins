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
    label: 'Subject',
    description: 'Тема задачи',
    canBePort: true,
    isPort: true,
  })
  subject?: string;

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
    label: 'Статус',
    description: 'status_id',
    canBePort: true,
    isPort: true,
  })
  statusId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Приоритет',
    description: 'priority_id',
    canBePort: true,
    isPort: true,
  })
  priorityId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Исполнитель',
    description: 'assigned_to_id',
    canBePort: true,
    isPort: true,
  })
  assignedToId?: number;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Done ratio',
    description: 'Процент выполнения (0–100)',
    canBePort: true,
    isPort: true,
  })
  doneRatio?: number;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'textarea',
    label: 'Notes',
    description: 'Комментарий к обновлению',
    canBePort: true,
    isPort: true,
  })
  notes?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Issue',
    description: 'Обновлённая задача',
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
  nodeType: 'plugin.redmine.issue.update',
  name: 'Redmine: обновить задачу',
  description: 'Обновляет issue по ID (subject, status, notes и т.д.).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineUpdateIssueExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const {
      baseUrl,
      apiKey,
      issueId,
      subject,
      description,
      statusId,
      priorityId,
      assignedToId,
      doneRatio,
      notes,
    } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const body: Record<string, unknown> = {};
    if (subject !== undefined) body.subject = subject;
    if (description !== undefined) body.description = description;
    if (statusId !== undefined) body.status_id = statusId;
    if (priorityId !== undefined) body.priority_id = priorityId;
    if (assignedToId !== undefined) body.assigned_to_id = assignedToId;
    if (doneRatio !== undefined) body.done_ratio = doneRatio;
    if (notes !== undefined) body.notes = notes;

    const { data, status, text } = await client.put<{
      issue?: Record<string, unknown>;
    }>(`/issues/${issueId}.json`, { issue: body });

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      issue: data?.issue as Record<string, unknown>,
      status: 'ok',
    };
  }
}
