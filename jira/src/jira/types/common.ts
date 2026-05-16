export type JiraId = string;
export type JiraKey = string;
export type ProjectKey = string;

export type Pagination = {
  maxResults?: number;
  offset?: number;
  total?: number;
};

export type JiraUserRef = {
  id?: JiraId;
  displayName?: string;
  emailAddress?: string;
};

export type JiraFieldMap = Record<string, unknown>;
