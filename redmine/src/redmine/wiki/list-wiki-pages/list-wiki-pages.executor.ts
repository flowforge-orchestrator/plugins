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

  @FieldDecorator({
    type: 'string',
    label: 'Проект',
    description: 'ID или identifier проекта (например: 1 или redmine)',
    canBePort: true,
    isPort: true,
  })
  projectId!: string;
}

class OutputDto {
  @FieldDecorator({
    type: 'keyvalue',
    label: 'Wiki pages',
    description: 'Список страниц (title, version, created_on, updated_on)',
  })
  wikiPages?: Array<Record<string, unknown>>;

  @FieldDecorator({
    type: 'string',
    label: 'Статус',
    description: 'ok или описание ошибки',
  })
  status?: string;
}

@Executor<InputDto, OutputDto>({
  nodeType: 'plugin.redmine.wiki.list',
  name: 'Redmine: список wiki-страниц',
  description:
    'Получает список всех wiki-страниц проекта (для поиска SDLC и др.).',
  help,
  pluginId: 'redmine',
  inputs: InputDto,
  outputs: OutputDto,
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class RedmineListWikiPagesExecutor {
  async execute(ctx: ExecContext<InputDto>): Promise<OutputDto> {
    const { baseUrl, apiKey, projectId } = ctx.inputs;

    const client = new RedmineClient({ baseUrl, apiKey });

    const path = `/projects/${encodeURIComponent(projectId)}/wiki/index.json`;
    const { data, status, text } = await client.get<{
      wiki_pages?: Array<Record<string, unknown>>;
    }>(path);

    if (status < 200 || status >= 300) {
      return { status: `error: ${status} - ${text}` };
    }

    return {
      wikiPages: data?.wiki_pages ?? [],
      status: 'ok',
    };
  }
}
