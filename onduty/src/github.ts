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

import {Logger} from 'onduty';
import {Octokit} from '@octokit/rest';

/** Interface for working with the GitHub API. */
export class GitHub {
  /** Constructor. */
  constructor(
    private client: Octokit,
    private org: string,
    private logger: Logger = console
  ) {}

  /** Fetch the usernames of all members of a team. */
  async getTeamMembers(teamName: string): Promise<Array<string>> {
    this.logger.info(`[getTeamMembers] Fetching members of team "${teamName}"`);

    const {data} = await this.client.teams.listMembersInOrg({
      org: this.org,
      'team_slug': teamName,
    });
    const usernames = data.map(({login}) => login.toLowerCase());
    this.logger.debug(
      `[getTeamMembers] Found members: ${usernames.join(', ')}`
    );

    return usernames;
  }

  /** Add a user to a team. */
  async addToTeam(teamName: string, username: string): Promise<void> {
    this.logger.info(`[addToTeam] Adding ${username} to team "${teamName}"`);

    await this.client.teams.addOrUpdateMembershipInOrg({
      org: this.org,
      'team_slug': teamName,
      username,
    });
  }

  /** Remove a user to a team. */
  async removeFromTeam(teamName: string, username: string): Promise<void> {
    this.logger.info(
      `[removeFromTeam] Removing ${username} from team "${teamName}"`
    );

    await this.client.teams.removeMembershipInOrg({
      org: this.org,
      'team_slug': teamName,
      username,
    });
  }
}
