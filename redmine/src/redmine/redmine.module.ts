import { Module } from '@nestjs/common';
import { RedmineCreateIssueModule } from './issue/create-issue/create-issue.module';
import { RedmineGetIssueModule } from './issue/get-issue/get-issue.module';
import { RedmineListIssuesModule } from './issue/list-issues/list-issues.module';
import { RedmineUpdateIssueModule } from './issue/update-issue/update-issue.module';
import { RedmineGetWikiPageModule } from './wiki/get-wiki-page/get-wiki-page.module';
import { RedmineListWikiPagesModule } from './wiki/list-wiki-pages/list-wiki-pages.module';
import { RedmineUpdateWikiPageModule } from './wiki/update-wiki-page/update-wiki-page.module';
import { RedmineProjectsListModule } from './reference/projects-list/projects-list.module';
import { RedmineTrackersListModule } from './reference/trackers-list/trackers-list.module';
import { RedmineIssueStatusesListModule } from './reference/issue-statuses-list/issue-statuses-list.module';

@Module({
  imports: [
    RedmineCreateIssueModule,
    RedmineGetIssueModule,
    RedmineListIssuesModule,
    RedmineUpdateIssueModule,
    RedmineGetWikiPageModule,
    RedmineListWikiPagesModule,
    RedmineUpdateWikiPageModule,
    RedmineProjectsListModule,
    RedmineTrackersListModule,
    RedmineIssueStatusesListModule,
  ],
})
export class RedmineModule {}
