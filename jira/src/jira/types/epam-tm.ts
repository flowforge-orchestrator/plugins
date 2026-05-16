import { JiraId, JiraKey, ProjectKey, JiraUserRef } from './common';

export type EpamTmStatus =
  | 'UNEXECUTED'
  | 'PASS'
  | 'FAIL'
  | 'IN_PROGRESS'
  | 'ABORTED'
  | 'BLOCKED';

export type EpamTestRun = {
  id: JiraId;
  key: JiraKey;
  name: string;
  status: EpamTmStatus;
  createdDate: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  executedDate?: string;
  creator?: JiraUserRef;
  project: {
    key: ProjectKey;
  };
};

export type EpamTestRunListResponse = {
  values: EpamTestRun[];
  total: number;
};

export type GetEpamTestRunsParams = {
  projectKey: ProjectKey;
  maxResults?: number;
  offset?: number;
  status?: EpamTmStatus[];
  includeArchived?: boolean;
  orderBy?: 'createdDate' | 'plannedStartDate' | 'plannedEndDate' | 'name';
  orderByDirection?: 'ASC' | 'DESC';
};

export type CreateEpamTestRunInput = {
  projectKey: ProjectKey;
  name: string;
  description?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  environment?: string;
  testPlanKey?: JiraKey;
};

export type UpdateEpamTestRunInput = {
  name?: string;
  description?: string;
  status?: EpamTmStatus;
  plannedStartDate?: string;
  plannedEndDate?: string;
  environment?: string;
};
