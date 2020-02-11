/**
 * Copyright 2020 The AMP HTML Authors.
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

import {ILogger} from './types';

// TODO: Enable after filling in implementations.
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Interface for working with the GitHub API.
 */
export class GitHub {
  /**
   * Constructor.
   */
  constructor(
    private client: Octokit,
    private org: string,
    private logger: ILogger = console
  ) {}

  /**
   * Attempts to invite a user to the organization. Returns true if an invite
   * was sent; false if the user was already a member.
   */
  async inviteUser(username: string): Promise<boolean> {
    const response = await this.client.orgs.addOrUpdateMembership({
      org: this.org,
      username,
    });

    return response.data.state === 'pending';
  }

  /**
   * Adds a comment to an issue.
   */
  async addComment(
    repo: string,
    issue_number: number,
    comment: string
  ): Promise<void> {
    await this.client.issues.createComment({
      owner: this.org,
      repo,
      issue_number,
      body: comment,
    });
  }

  /**
   * Assigns an issue to a user.
   */
  async assignIssue(
    repo: string,
    issue_number: number,
    assignee: string
  ): Promise<void> {
    await this.client.issues.addAssignees({
      owner: this.org,
      repo,
      issue_number,
      assignees: [assignee],
    });
  }
}

module.exports = {GitHub};
