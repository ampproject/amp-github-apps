/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
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

const nock = require('nock');
const NodeCache = require('node-cache');
const {dbConnect} = require('../db');
const {getFixture} = require('./_test_helper');
const {GitHubUtils} = require('../github-utils');
const {installGitHubWebhooks} = require('../webhooks');
const {Probot} = require('probot');
const {setupDb} = require('../setup-db');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');
jest.mock('../db');

describe('bundle-size webhooks', () => {
  let github;
  let probot;
  let app;
  const db = dbConnect();
  const nodeCache = new NodeCache();

  beforeAll(async () => {
    await setupDb(db);
  });

  beforeEach(async () => {
    github = {
      checks: {
        create: jest.fn().mockResolvedValue({data: {id: 555555}}),
        update: jest.fn(),
      },
      teams: {
        listMembersInOrg: jest.fn().mockImplementation(params => {
          const fixture = `teams.listMembersInOrg.${params.team_slug}`;
          return Promise.resolve({data: getFixture(fixture)});
        }),
      },
    };

    class Octokit {
      constructor() {}

      static defaults() {
        return this;
      }

      get checks() {
        return github.checks;
      }

      get teams() {
        return github.teams;
      }
    }

    probot = new Probot({Octokit});
    app = probot.load(app => {
      const githubUtils = new GitHubUtils(github, app.log, nodeCache);
      installGitHubWebhooks(app, db, githubUtils);
    });
    app.auth = () => github;

    nodeCache.flushAll();

    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
      CI_PUSH_BUILD_TOKEN: '0123456789abcdefghijklmnopqrstuvwxyz',
      FALLBACK_APPROVER_TEAMS:
        'ampproject/wg-runtime,ampproject/wg-performance',
      SUPER_USER_TEAMS: 'ampproject/wg-infra',
    };
  });

  afterEach(async () => {
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('pull_request', () => {
    test('create a new pending check when a pull request is opened', async () => {
      const payload = getFixture('pull_request.opened');

      await probot.receive({name: 'pull_request', payload});

      expect(await db('checks').select('*')).toEqual([
        {
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: null,
          report_markdown: null,
        },
      ]);

      expect(github.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          name: 'ampproject/bundle-size',
          output: {
            title: 'Calculating new bundle size for this PR…',
          },
        })
      );
    });

    test('update a pending check when a pull request is synced', async () => {
      await db('checks').insert({
        head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19621,
        installation_id: 123456,
        check_run_id: 444444,
        approving_teams: null,
        report_markdown: null,
      });

      const payload = getFixture('pull_request.opened');

      await probot.receive({name: 'pull_request', payload});

      expect(await db('checks').select('*')).toEqual([
        {
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: null,
          report_markdown: null,
        },
      ]);

      expect(github.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          name: 'ampproject/bundle-size',
          output: {
            title: 'Calculating new bundle size for this PR…',
          },
        })
      );
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

      expect(github.checks.create).not.toHaveBeenCalled();
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

      await probot.receive({name: 'check_run', payload: checkRunPayload});
      expect(await db('merges').select('*')).toEqual([]);

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 68609861,
          conclusion: 'neutral',
          output: {
            title: 'Check skipped because this is a merged commit',
          },
        })
      );
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
    test.each([
      ['with no report_markdown', ''],
      ['with a report_markdown', '* `dist/v0/amp-ad-0.1.js`: Δ +0.34KB'],
    ])(
      'mark a check as successful when a capable user approves the PR %s',
      async (_, report_markdown) => {
        const payload = getFixture('pull_request_review.submitted');

        await db('checks').insert({
          head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19603,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
          report_markdown,
        });

        await probot.receive({name: 'pull_request_review', payload});

        expect(github.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            conclusion: 'success',
            output: {
              title: 'approved by @choumx',
              summary: expect.stringContaining(
                'The bundle size change(s) of this pull request were approved by @choumx'
              ),
            },
          })
        );
        expect(github.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            output: {
              summary: expect.stringContaining(report_markdown),
            },
          })
        );
      }
    );

    test('mark a preemptive approval check as successful when a super user approves the PR', async () => {
      const payload = getFixture('pull_request_review.submitted');
      payload.review.user.login = 'rsimha';

      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      await probot.receive({name: 'pull_request_review', payload});

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'success',
          output: {
            title: 'approved by @rsimha',
          },
        })
      );
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
        approving_teams: null,
        report_markdown: null,
      });

      await probot.receive({name: 'pull_request_review', payload});

      expect(github.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a non-capable reviewer', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await probot.receive({name: 'pull_request_review', payload});

      expect(github.checks.update).not.toHaveBeenCalled();
    });

    test('ignore a "changes requested" review', async () => {
      const payload = getFixture('pull_request_review.submitted');
      payload.state = 'changes_requested';

      await probot.receive({name: 'pull_request_review', payload});

      expect(github.checks.update).not.toHaveBeenCalled();
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
        approving_teams: '',
        report_markdown: null,
      });

      await probot.receive({name: 'pull_request_review', payload});

      expect(github.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a capable reviewer for unknown PRs', async () => {
      const payload = getFixture('pull_request_review.submitted');

      await probot.receive({name: 'pull_request_review', payload});

      expect(github.checks.update).not.toHaveBeenCalled();
    });
  });
});
