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
  private client: Octokit;
  private org: string;
  private logger: ILogger;

  /**
   * Constructor.
   */
  constructor(client: Octokit, org: string, logger: ILogger = console) {
    Object.assign(this, {client, org, logger});
  }

  /**
   * Checks whether a user is a member of the organization.
   */
  async userIsMember(username: string): Promise<boolean> {
    // https://octokit.github.io/rest.js/#octokit-routes-orgs-check-membership
    // octokit.orgs.checkMembership({org, username});
    return false;
  }

  /**
   * Attempts to invite a user to the organization.
   */
  async inviteUser(username: string): Promise<boolean> {
    // https://octokit.github.io/rest.js/#octokit-routes-orgs-create-invitation
    // octokit.orgs.addOrUpdateMembership({org, username})
    return false;
  }

  /**
   * Adds a comment to an issue.
   */
  async addComment(
    repo: string,
    issue_number: number,
    comment: string
  ): Promise<void> {
    // https://octokit.github.io/rest.js/#octokit-routes-issues-create-comment
    // octokit.issues.createComment({owner, repo, issue_number, body})
  }

  /**
   * Assigns an issue to a user.
   */
  async assignIssue(
    repo: string,
    issue_number: number,
    assignee: string
  ): Promise<void> {
    // https://octokit.github.io/rest.js/#octokit-routes-issues-add-assignee
    // octokit.issues.addAssignees({owner, repo, issue_number, assignees})
  }
}

module.exports = {GitHub};
