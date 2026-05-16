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

  @IsOptional()
  @IsString()
  @FieldDecorator({
    type: 'string',
    label: 'Include',
    description: 'Связанные данные: attachments',
    canBePort: true,
    isPort: true,
  })
  include?: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Wiki page',
    description: 'Данные страницы (title, text, version, ...)',
  })
  wikiPage?: Record<string, unknown>;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.wiki.get',
  name: 'Redmine: получить wiki-страницу',
  description: 'Получает wiki-страницу проекта по имени.',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineGetWikiPageExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey, projectId, pageName, include } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const query: Record<string, string | number | undefined> = {};
    if (include) query.include = include;

    const path = `/projects/${encodeURIComponent(projectId)}/wiki/${encodeURIComponent(pageName)}.json`;
    const { data, status, text } = await client.get<{
      wiki_page?: Record<string, unknown>;
    }>(path, Object.keys(query).length ? query : undefined);

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      wikiPage: data?.wiki_page as Record<string, unknown>,
      status: 'ok',
    };
  }
}
