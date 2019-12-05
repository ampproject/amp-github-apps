/**
 * Copyright 2018, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {dbConnect} = require('../db');
const {getFixture} = require('./_test_helper');
const {GitHubUtils} = require('../github-utils');
const {installGitHubWebhooks} = require('../webhooks');
const nock = require('nock');
const NodeCache = require('node-cache');
const Octokit = require('@octokit/rest');
const {Probot} = require('probot');
const {setupDb} = require('../setup-db');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');
jest.mock('../db');

describe('bundle-size webhooks', () => {
  let probot;
  let app;
  const db = dbConnect();
  const nodeCache = new NodeCache();

  beforeAll(async () => {
    await setupDb(db);

    probot = new Probot({});
    app = probot.load(app => {
      const githubUtils = new GitHubUtils(new Octokit(), app.log, nodeCache);
      installGitHubWebhooks(app, db, githubUtils);
    });

    // Return a test token.
    app.app = {
      getInstallationAccessToken: () => Promise.resolve('test'),
    };
  });

  beforeEach(async () => {
    nodeCache.flushAll();

    process.env = {
      TRAVIS_PUSH_BUILD_TOKEN: '0123456789abcdefghijklmnopqrstuvwxyz',
      MAX_ALLOWED_INCREASE: '0.1',
      APPROVER_TEAMS: '123,234',
      REVIEWER_TEAMS: '123',
    };

    nock('https://api.github.com')
      .post('/app/installations/123456/access_tokens')
      .reply(200, {token: 'test'});

    nock('https://api.github.com')
      .persist()
      .get('/teams/123/memberships/aghassemi')
      .reply(404)
      .get('/teams/234/memberships/aghassemi')
      .reply(200)
      .get(/teams\/\d+\/memberships\/\w+$/)
      .reply(404)
      .get('/teams/123/members')
      .reply(200, getFixture('teams.123.members'))
      .get('/teams/234/members')
      .reply(200, getFixture('teams.234.members'));
  });

  afterEach(async () => {
    nock.cleanAll();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('pull_request', () => {
    test('create a new pending check when a pull request is opened', async () => {
      const payload = getFixture('pull_request.opened');

      const nocks = nock('https://api.github.com')
        .post('/repos/ampproject/amphtml/check-runs', body => {
          expect(body).toMatchObject({
            head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
            name: 'ampproject/bundle-size',
            output: {
              title: 'Calculating new bundle size for this PR…',
            },
          });
          return true;
        })
        .reply(200, {id: 555555});

      await probot.receive({name: 'pull_request', payload});
      nocks.done();

      expect(await db('checks').select('*')).toEqual([
        {
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
          check_run_id: 555555,
          delta: null,
          approving_teams: null,
        },
      ]);
    });

    test('update a pending check when a pull request is synced', async () => {
      await db('checks').insert({
        head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19621,
        installation_id: 123456,
        check_run_id: 444444,
        delta: null,
        approving_teams: null,
      });

      const payload = getFixture('pull_request.opened');

      const nocks = nock('https://api.github.com')
        .post('/repos/ampproject/amphtml/check-runs', body => {
          expect(body).toMatchObject({
            head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
            name: 'ampproject/bundle-size',
            output: {
              title: 'Calculating new bundle size for this PR…',
            },
          });
          return true;
        })
        .reply(200, {id: 555555});

      await probot.receive({name: 'pull_request', payload});
      nocks.done();

      expect(await db('checks').select('*')).toEqual([
        {
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
          check_run_id: 555555,
          delta: null,
          approving_teams: null,
        },
      ]);
    });

    test('ignore closed (not merged) pull request', async () => {
      const pullRequestPayload = getFixture('pull_request.opened');
      pullRequestPayload.action = 'closed';

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      });
      expect(await db('merges').select('*')).toEqual([]);

      const checkRunPayload = getFixture('check_run.created');

      await probot.receive({name: 'check_run', payload: checkRunPayload});
    });

    test('skip the check on a merged pull request', async () => {
      const pullRequestPayload = getFixture('pull_request.opened');
      pullRequestPayload.action = 'closed';
      pullRequestPayload.pull_request.merged_at = '2019-02-25T20:21:58Z';
      pullRequestPayload.pull_request.merge_commit_sha =
        '4ba02c691d1a3014f70a7521c07d775dc6a1e355';

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      });
      expect(await db('merges').select('*')).toEqual([
        {merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355'},
      ]);

      const checkRunPayload = getFixture('check_run.created');

      const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/68609861', body => {
          expect(body).toMatchObject({
            conclusion: 'neutral',
            output: {
              title: 'Check skipped because this is a merged commit',
            },
          });
          return true;
        })
        .reply(200);

      await probot.receive({name: 'check_run', payload: checkRunPayload});
      expect(await db('merges').select('*')).toEqual([]);
      nocks.done();
    });

    test('fail when a pull request is reported as merged twice', async () => {
      const pullRequestPayload = getFixture('pull_request.opened');
      pullRequestPayload.action = 'closed';
      pullRequestPayload.pull_request.merged_at = '2019-02-25T20:21:58Z';
      pullRequestPayload.pull_request.merge_commit_sha =
        '4ba02c691d1a3014f70a7521c07d775dc6a1e355';

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      });
      try {
        await probot.receive({
          name: 'pull_request',
          payload: pullRequestPayload,
        });
      } catch (e) {
        expect(e.message).toContain('UNIQUE constraint failed');
      }
    });
  });

  describe('pull_request_review', () => {
    test('mark a check as successful when a capable user approves the PR', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        delta: 0.2,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
      });

      const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'success',
            output: {
              title: 'Δ +0.20KB | approved by @aghassemi',
            },
          });
          return true;
        })
        .reply(200);

      await probot.receive({name: 'pull_request_review', payload});
      nocks.done();
    });

    test('ignore a preemptive approval', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        delta: null,
        approving_teams: null,
      });

      await probot.receive({name: 'pull_request_review', payload});
    });

    test('ignore an approved review by a non-capable reviewer', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await probot.receive({name: 'pull_request_review', payload});
    });

    test('ignore a "changes requested" review', async () => {
      const payload = getFixture('pull_request_review.submitted');
      payload.state = 'changes_requested';

      await probot.receive({name: 'pull_request_review', payload});
    });

    test('ignore an approved review by a capable reviewer for small delta', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        delta: 0.05,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
      });

      await probot.receive({name: 'pull_request_review', payload});
    });

    test('ignore an approved review by a capable reviewer for unknown PRs', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await probot.receive({name: 'pull_request_review', payload});
    });
  });
});
