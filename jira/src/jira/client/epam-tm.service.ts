import { Injectable } from '@nestjs/common';
import { JiraClient } from './jira.client';
import {
  CreateEpamTestRunInput,
  EpamTestRunListResponse,
  GetEpamTestRunsParams,
  UpdateEpamTestRunInput,
} from '../types/epam-tm';

@Injectable()
export class EpamTmService {
  constructor(private readonly client: JiraClient) {}

  listTestRuns(
    params: GetEpamTestRunsParams,
  ): Promise<EpamTestRunListResponse> {
    return this.client.get('/rest/tm/1.0/testrun/list', {
      projectKey: params.projectKey,
      maxResults: params.maxResults?.toString(),
      offset: params.offset?.toString(),
      status: params.status?.join(','),
      includeArchived:
        params.includeArchived !== undefined
          ? String(params.includeArchived)
          : undefined,
      orderBy: params.orderBy,
      orderByDirection: params.orderByDirection,
    });
  }

  createTestRun(input: CreateEpamTestRunInput) {
    return this.client.post('/rest/tm/1.0/testrun', {
      projectKey: input.projectKey,
      name: input.name,
      description: input.description,
      plannedStartDate: input.plannedStartDate,
      plannedEndDate: input.plannedEndDate,
      environment: input.environment,
      testPlanKey: input.testPlanKey,
    });
  }

  updateTestRun(testRunKey: string, input: UpdateEpamTestRunInput) {
    return this.client.put(`/rest/tm/1.0/testrun/${testRunKey}`, input);
  }
}
