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

import {RateLimitedGraphQL} from './rate_limited_graphql';
import {BlameFinder} from './blame_finder';
import {IssueBuilder} from './issue_builder.stub';
import {ErrorReport} from './types';

const GRAPHQL_FREQ_MS = parseInt(process.env.GRAPHQL_FREQ_MS, 10) || 100;

export class ErrorIssueBot {
  private octokit: Octokit;
  private blameFinder: BlameFinder;

  constructor(
    token: string,
    private repoOwner: string,
    private repoName: string
  ) {
    this.octokit = new Octokit({auth: token});
    this.blameFinder = new BlameFinder(
      repoOwner,
      repoName,
      new RateLimitedGraphQL(token, GRAPHQL_FREQ_MS)
    );
  }

  /** Builds the issue to create. */
  async buildErrorIssue(
    errorReport: ErrorReport
  ): Promise<Octokit.IssuesCreateParams> {
    const {stacktrace} = errorReport;
    const blameRanges = await this.blameFinder.blameForStacktrace(stacktrace);
    const builder = new IssueBuilder(errorReport, blameRanges);
    return {
      owner: this.repoOwner,
      repo: this.repoName,
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
}
