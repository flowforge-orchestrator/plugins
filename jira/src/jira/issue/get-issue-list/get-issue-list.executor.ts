import {
  ExecContext,
  Executor,
  loadHelpFromFile,
} from '@kosolapus/plugin-ts-sdk';
import { publicationPullEndpointFromEnv } from '../../../getUrlFromEnv';
import { GetIssuesOutputDto, GetIssuesStepDto } from './dto';
import { JiraClient } from '../../client/jira.client';
import { IssueService } from '../../client/issue.service';

@Executor<GetIssuesStepDto, GetIssuesOutputDto>({
  name: 'Jira: получение списка задач',
  description:
    'Получение списка задач Jira, назначенных текущему пользователю. Поддерживает фильтрацию по статусам, типу и полям.',
  help: loadHelpFromFile(__dirname),
  pluginId: 'jira',
  inputs: GetIssuesStepDto,
  outputs: GetIssuesOutputDto,
  nodeType: 'plugin.jira.issue.get',
  transport: {
    type: 'tcp',
    params: publicationPullEndpointFromEnv(),
  },
})
export class GetIssuesExecutor {
  async execute(
    context: ExecContext<GetIssuesStepDto>,
    input: GetIssuesStepDto,
  ): Promise<GetIssuesOutputDto> {
    const client = new JiraClient({
      baseUrl: context.inputs.baseUrl,
      token: context.inputs.token,
    });

    const issueService = new IssueService(client);

    const response = await issueService.getMyIssues({
      statuses: input.statuses,
      maxResults: input.maxResults,
      onlyActive: input.onlyActive,
      type: input.type,
      fields: input.fields,
    });

    return {
      issues: response.issues ?? [],
      total: response.total ?? 0,
    };
  }
}
