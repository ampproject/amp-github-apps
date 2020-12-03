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

import {GitHub} from '../src/github';
import {Logger} from 'onduty';
import {Octokit} from '@octokit/rest';

describe('GitHub', () => {
  let octokit: Octokit;
  let github: GitHub;
  const fakeConsole: Logger = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(() => {
    octokit = ({
      teams: {
        listMembersInOrg: jest.fn().mockResolvedValue({
          data: [{login: 'aUser'}, {login: 'someone'}],
        }),
        addOrUpdateMembershipForUserInOrg: jest
          .fn()
          .mockResolvedValue(undefined),
        removeMembershipForUserInOrg: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown) as Octokit;
    github = new GitHub(octokit, 'test_org', fakeConsole);
  });

  describe('getTeamMembers', () => {
    it('requests team members', async () => {
      await github.getTeamMembers('test_team');
      expect(octokit.teams.listMembersInOrg).toHaveBeenCalledWith({
        org: 'test_org',
        'team_slug': 'test_team',
      });
    });

    it('returns member usernames', async () => {
      await expect(github.getTeamMembers('test_team')).resolves.toEqual([
        'auser',
        'someone',
      ]);
    });
  });

  describe('addToTeam', () => {
    it('adds the user to the team', async () => {
      await github.addToTeam('test_team', 'newbie');
      expect(
        octokit.teams.addOrUpdateMembershipForUserInOrg
      ).toHaveBeenCalledWith({
        org: 'test_org',
        'team_slug': 'test_team',
        username: 'newbie',
      });
    });
  });

  describe('removeFromTeam', () => {
    it('removes the user from the team', async () => {
      await github.removeFromTeam('test_team', 'someone');
      expect(octokit.teams.removeMembershipForUserInOrg).toHaveBeenCalledWith({
        org: 'test_org',
        'team_slug': 'test_team',
        username: 'someone',
      });
    });
  });
});
