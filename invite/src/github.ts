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

/** Interface for working with the GitHub API. */
export class GitHub {
  /** Constructor. */
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
    this.logger.info(`inviteUser: Sending an invite to @${username}`);
    const response = await this.client.orgs.addOrUpdateMembership({
      org: this.org,
      username,
    });

    return response.data.state === 'pending';
  }

  /** Adds a comment to an issue. */
  async addComment(
    repo: string,
    issue_number: number,
    comment: string
  ): Promise<void> {
    this.logger.info(`addComment: Commenting on ${repo}#${issue_number}`);
    await this.client.issues.createComment({
      owner: this.org,
      repo,
      issue_number,
      body: comment,
    });
  }

  /** Assigns an issue to a user. */
  async assignIssue(
    repo: string,
    issue_number: number,
    assignee: string
  ): Promise<void> {
    this.logger.info(
      `assignIssue: Assigning @${assignee} to ${repo}#${issue_number}`
    );
    await this.client.issues.addAssignees({
      owner: this.org,
      repo,
      issue_number,
      assignees: [assignee],
    });
  }

  /* Checks whether a user is a member of the organization. */
  async userIsTeamMember(username: string, teamSlug: string): Promise<boolean> {  
    this.logger.info(
      `userIsTeamMember: Checking if @${username} is a member of ${teamSlug}`
    );
    // The membership API returns status 404 when the user is not a member of
    // the organization, but Octokit handles this by rejecting the promise. We
    // only need the status code to make a determination, so the `catch` handler
    // just forwards along the response.
    const [org, teamName] = teamSlug.split('/');
    const response = await this.client.teams.getMembershipInOrg({
      org,
      team_slug: teamName,
      username,
    }).catch(errorResponse => errorResponse); 

    return response.status === 200 && response.data.state === 'active'; 
  }
}

module.exports = {GitHub};
