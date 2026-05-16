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
    type: 'string',
    label: 'Проект',
    description: 'ID или identifier проекта (например: 1 или redmine)',
    canBePort: true,
    isPort: true,
  })
  projectId!: string;

  @FieldDecorator({
    type: 'string',
    label: 'Страница',
    description: 'Имя wiki-страницы (например: UsersGuide или Wiki)',
    canBePort: true,
    isPort: true,
  })
  pageName!: string;

  @IsString()
  @MinLength(1)
  @FieldDecorator({
    type: 'textarea',
    label: 'Текст',
    description: 'Содержимое страницы (обязательно)',
    canBePort: true,
    isPort: true,
  })
  text!: string;

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Comments',
    description: 'Комментарий к изменениям',
    canBePort: true,
    isPort: true,
  })
  comments?: string;

  @IsOptional()
  @IsNumber()
  @FieldDecorator({
    type: 'number',
    label: 'Version',
    description: 'Версия для optimistic locking (409 при конфликте)',
    canBePort: true,
    isPort: true,
  })
  version?: number;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Wiki page',
    description: 'Обновлённая страница',
  })
  wikiPage?: Record<string, unknown>;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok, created или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.wiki.update',
  name: 'Redmine: обновить wiki-страницу',
  description:
    'Создаёт или обновляет wiki-страницу проекта. Поле text обязательно.',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineUpdateWikiPageExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey, projectId, pageName, text, comments, version } =
      ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const body: Record<string, unknown> = { text };
    if (comments !== undefined) body.comments = comments;
    if (version !== undefined) body.version = version;

    const path = `/projects/${encodeURIComponent(projectId)}/wiki/${encodeURIComponent(pageName)}.json`;
    const {
      data,
      status,
      text: responseText,
    } = await client.put<{ wiki_page?: Record<string, unknown> }>(path, {
      wiki_page: body,
    });

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${responseText}` };
    }

    const resultStatus = status === 201 ? 'created' : 'ok';

    return {
      wikiPage: data?.wiki_page as Record<string, unknown>,
      status: resultStatus,
    };
  }
}
