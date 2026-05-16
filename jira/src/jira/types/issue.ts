// jira/types/issue.ts
import {
  JiraId,
  JiraKey,
  ProjectKey,
  JiraUserRef,
  JiraFieldMap,
} from './common';

export type IssueRef = {
  id: JiraId;
  key: JiraKey;
};

export type IssueStatus = {
  id: JiraId;
  name: string;
  statusCategory?: {
    id: JiraId;
    key: string;
    name: string;
  };
};

export type IssueType = {
  id: JiraId;
  name: string;
};

export type IssuePriority = {
  id: JiraId;
  name: string;
};

export type IssueFieldsBase = {
  summary: string;
  description?: string;
  status?: IssueStatus;
  issuetype?: IssueType;
  priority?: IssuePriority;
  assignee?: JiraUserRef;
  reporter?: JiraUserRef;
  creator?: JiraUserRef;
};

export type Issue = IssueRef & {
  fields: IssueFieldsBase & {
    customFields?: JiraFieldMap;
  };
};

export type CreateIssueInput = {
  projectKey: ProjectKey;
  summary: string;
  issueType: string;
  description?: string;
  customFields?: JiraFieldMap;
};

export type UpdateIssueInput = {
  issueKey: JiraKey;
  fields: Partial<IssueFieldsBase>;
  customFields?: JiraFieldMap;
};
