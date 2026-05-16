import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { RedmineProjectsListExecutor } from './reference/projects-list/projects-list.executor';
import { RedmineTrackersListExecutor } from './reference/trackers-list/trackers-list.executor';
import { RedmineIssueStatusesListExecutor } from './reference/issue-statuses-list/issue-statuses-list.executor';
import { RedmineUpdateIssueExecutor } from './issue/update-issue/update-issue.executor';
import { RedmineListIssuesExecutor } from './issue/list-issues/list-issues.executor';
import { RedmineGetIssueExecutor } from './issue/get-issue/get-issue.executor';
import { RedmineCreateIssueExecutor } from './issue/create-issue/create-issue.executor';
import { RedmineUpdateWikiPageExecutor } from './wiki/update-wiki-page/update-wiki-page.executor';
import { RedmineListWikiPagesExecutor } from './wiki/list-wiki-pages/list-wiki-pages.executor';
import { RedmineGetWikiPageExecutor } from './wiki/get-wiki-page/get-wiki-page.executor';

const EXECUTOR_CLASSES = [
  RedmineProjectsListExecutor,
  RedmineTrackersListExecutor,
  RedmineIssueStatusesListExecutor,
  RedmineUpdateIssueExecutor,
  RedmineListIssuesExecutor,
  RedmineGetIssueExecutor,
  RedmineCreateIssueExecutor,
  RedmineUpdateWikiPageExecutor,
  RedmineListWikiPagesExecutor,
  RedmineGetWikiPageExecutor,
] as const;

export function getRedmineExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
