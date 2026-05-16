// jira/issue.service.ts
import { Injectable } from '@nestjs/common';
import { JiraClient } from './jira.client';
import { CreateIssueInput, Issue, UpdateIssueInput } from '../types/issue';

@Injectable()
export class IssueService {
  constructor(private readonly client: JiraClient) {}

  getMyIssues(params: {
    statuses?: string[];
    maxResults?: number;
    fields?: string[];
    onlyActive?: boolean;
    type?: string;
  }): Promise<{ issues: Issue[]; total: number }> {
    const jql: string[] = ['assignee = currentUser()'];

    if (params.statuses?.length) {
      jql.push(`status IN (${params.statuses.map((s) => `"${s}"`).join(',')})`);
    }

    if (params.onlyActive) {
      jql.push('statusCategory != Done');
    }

    if (params.type) {
      jql.push(`type = "${params.type}"`);
    }

    return this.client.get('/rest/api/2/search', {
      jql: jql.join(' AND '),
      maxResults: String(params.maxResults ?? 50),
      fields: params.fields?.join(','),
    });
  }

  createIssue(input: CreateIssueInput) {
    return this.client.post('/rest/api/2/issue', {
      fields: {
        project: { key: input.projectKey },
        summary: input.summary,
        description: input.description,
        issuetype: { name: input.issueType },
        ...(input.customFields ?? {}),
      },
    });
  }

  updateIssue(input: UpdateIssueInput) {
    return this.client.put(`/rest/api/2/issue/${input.issueKey}`, {
      fields: {
        ...(input.fields ?? {}),
        ...(input.customFields ?? {}),
      },
    });
  }
}
