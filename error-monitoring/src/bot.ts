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

import {ErrorReport} from 'error-monitoring';
import {Octokit} from '@octokit/core';
import {
  type RestEndpointMethodTypes,
  restEndpointMethods,
} from '@octokit/plugin-rest-endpoint-methods';
import nodeFetch from 'node-fetch';

import {BlameFinder} from './blame_finder';
import {IssueBuilder} from './issue_builder';
import {RateLimitedGraphQL} from './rate_limited_graphql';

type IssuesCreateParams =
  RestEndpointMethodTypes['issues']['create']['parameters'];

const GRAPHQL_FREQ_MS = parseInt(process.env.GRAPHQL_FREQ_MS ?? '100', 10);
const RELEASE_ONDUTY =
  process.env.RELEASE_ONDUTY ?? 'ampproject/release-on-duty';

const AppOctokit = Octokit.plugin(restEndpointMethods);

export class ErrorIssueBot {
  private readonly octokit: InstanceType<typeof AppOctokit>;
  private readonly blameFinder: BlameFinder;

  constructor(
    readonly token: string,
    private readonly repoOwner: string,
    private readonly repoName: string,
    private readonly issueRepoName: string = repoName
  ) {
    this.octokit = new AppOctokit({
      auth: `token ${token}`,
      request: {fetch: nodeFetch},
    });
    this.blameFinder = new BlameFinder(
      repoOwner,
      repoName,
      new RateLimitedGraphQL(token, GRAPHQL_FREQ_MS)
    );
  }

  /** Builds the issue to create. */
  async buildErrorIssue(errorReport: ErrorReport): Promise<IssuesCreateParams> {
    const {stacktrace} = errorReport;
    const blameRanges = await this.blameFinder.blameForStacktrace(stacktrace);
    const builder = new IssueBuilder(
      errorReport,
      `${this.repoOwner}/${this.repoName}`,
      blameRanges,
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

  /** Comments on an existing issue to link a duplicate error. */
  async commentWithDupe(errorId: string, issueNumber: number): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.repoOwner,
      repo: this.issueRepoName,
      'issue_number': issueNumber,
      body:
        'A duplicate error report was linked to this issue ' +
        `([link](http://go/ampe/${errorId}?project=${process.env.PROJECT_ID}))`,
    });
  }

  /** Creates an error report issue and returns the issue URL. */
  async report(errorReport: ErrorReport): Promise<string> {
    const issue = await this.buildErrorIssue(errorReport);
    const {data} = await this.octokit.rest.issues.create(issue);
    return data.html_url;
  }
}
