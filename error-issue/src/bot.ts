/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Octokit} from '@octokit/rest';

import {BlameFinder} from './blame_finder';
import {ErrorReport} from 'error-issue-bot';
import {IssueBuilder} from './issue_builder';
import {RateLimitedGraphQL} from './rate_limited_graphql';

const GRAPHQL_FREQ_MS = parseInt(process.env.GRAPHQL_FREQ_MS, 10) || 100;
const NOCOPY_SENTINEL = '<!-- DO NOT COPY BELOW -->';
const RELEASE_ONDUTY =
  process.env.RELEASE_ONDUTY || 'ampproject/release-on-duty';

export class ErrorIssueBot {
  private octokit: Octokit;
  private blameFinder: BlameFinder;

  constructor(
    token: string,
    private repoOwner: string,
    private codeRepoName: string,
    private issueRepoName: string
  ) {
    this.octokit = new Octokit({auth: `token ${token}`});
    this.blameFinder = new BlameFinder(
      repoOwner,
      codeRepoName,
      new RateLimitedGraphQL(token, GRAPHQL_FREQ_MS)
    );
  }

  /** Builds the issue to create. */
  async buildErrorIssue(
    errorReport: ErrorReport
  ): Promise<Octokit.IssuesCreateParams> {
    const {stacktrace} = errorReport;
    const blameRanges = await this.blameFinder.blameForStacktrace(stacktrace);
    const builder = new IssueBuilder(
      errorReport,
      blameRanges,
      `${this.repoOwner}/${this.codeRepoName}`,
      RELEASE_ONDUTY
    );
    return {
      owner: this.repoOwner,
      repo: this.issueRepoName,
      title: builder.title,
      labels: builder.labels,
      body: builder.body,
    };
  }

  /** Creates an error report issue and returns the issue URL. */
  async report(errorReport: ErrorReport): Promise<string> {
    const issue = await this.buildErrorIssue(errorReport);
    const {data} = await this.octokit.issues.create(issue);
    return data.html_url;
  }

  /** Copies an issue from one repo to another. */
  async copyIssue(
    fromIssueNumber: number,
    fromRepo: string,
    toRepo: string
  ): Promise<void> {
    const {data} = await this.octokit.issues.get({
      owner: this.repoOwner,
      repo: fromRepo,
      'issue_number': fromIssueNumber,
    });
    const {title, body, labels} = data;
    const trimmedBody = body.split(NOCOPY_SENTINEL, 1)[0].trim();

    await this.octokit.issues.create({
      owner: this.repoOwner,
      repo: toRepo,
      title,
      body: trimmedBody,
      labels: labels.map(({name}) => name),
    });
  }
}
