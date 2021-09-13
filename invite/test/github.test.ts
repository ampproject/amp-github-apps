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
import nock from 'nock';

import {GitHub} from '../src/github';
import {getFixture} from './fixtures';

describe('GitHub interface', () => {
  const githubClient: Octokit = new Octokit({auth: '_TOKEN_'});
  let github: GitHub;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();
    github = new GitHub(githubClient, 'test_org');
  });

  afterEach(() => {
    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  describe('inviteUser', () => {
    it('PUTs to /orgs/:org/memberships/:username', async () => {
      nock('https://api.github.com')
        .put('/orgs/test_org/memberships/someone')
        .reply(200, getFixture('add_member.exists'));

      await github.inviteUser('someone');
    });

    it('returns true when the user is invited', async () => {
      nock('https://api.github.com')
        .put('/orgs/test_org/memberships/someone')
        .reply(200, getFixture('add_member.invited'));

      await expect(github.inviteUser('someone')).resolves.toBe(true);
    });

    it('returns false when the user is already a member', async () => {
      nock('https://api.github.com')
        .put('/orgs/test_org/memberships/someone')
        .reply(200, getFixture('add_member.exists'));

      await expect(github.inviteUser('someone')).resolves.toBe(false);
    });
  });

  describe('addComment', () => {
    it('POSTs comment to /repos/:owner/:repo/issues/:issue_number/comments', async () => {
      nock('https://api.github.com')
        .post('/repos/test_org/test_repo/issues/1337/comments', body => {
          expect(body).toEqual({body: 'Test comment'});
          return true;
        })
        .reply(200);

      await github.addComment('test_repo', 1337, 'Test comment');
    });
  });

  describe('assignIssue', () => {
    it('POSTs assignee to /repos/:owner/:repo/issues/:issue_number/assignees', async () => {
      nock('https://api.github.com')
        .post('/repos/test_org/test_repo/issues/1337/assignees', body => {
          expect(body).toEqual({assignees: ['someone']});
          return true;
        })
        .reply(200);

      await github.assignIssue('test_repo', 1337, 'someone');
    });
  });

  describe('userIsTeamMember', () => {
    it('GETs /orgs/:org/teams/:team_slug/memberships/:username', async () => {
      nock('https://api.github.com')
        .get('/orgs/test_org/teams/test-team/memberships/someone')
        .reply(200, getFixture('team_membership.active'));

      await github.userIsTeamMember('someone', 'test_org/test-team');
    });

    it('returns true for "active" membership state', async () => {
      nock('https://api.github.com')
        .get('/orgs/test_org/teams/test-team/memberships/someone')
        .reply(200, getFixture('team_membership.active'));

      await expect(
        github.userIsTeamMember('someone', 'test_org/test-team')
      ).resolves.toBe(true);
    });

    it('returns false for "pending" membership state', async () => {
      nock('https://api.github.com')
        .get('/orgs/test_org/teams/test-team/memberships/someone')
        .reply(200, getFixture('team_membership.pending'));

      await expect(
        github.userIsTeamMember('someone', 'test_org/test-team')
      ).resolves.toBe(false);
    });

    it('returns false for 404: Not Found', async () => {
      nock('https://api.github.com')
        .get('/orgs/test_org/teams/test-team/memberships/someone')
        .reply(404, getFixture('team_membership.not_found'));

      await expect(
        github.userIsTeamMember('someone', 'test_org/test-team')
      ).resolves.toBe(false);
    });
  });
});
