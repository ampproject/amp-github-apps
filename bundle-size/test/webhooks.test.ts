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

import {type DeepMockProxy, mockDeep} from 'vitest-mock-extended';
import {type Logger, Options, Probot} from 'probot';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import NodeCache from 'node-cache';

import {GitHubUtils} from '../src/github-utils';
import {
  type OctokitParamsType,
  type OctokitResponseType,
  inMemoryDbConnect,
} from './_test_helper';
import {installGitHubWebhooks} from '../src/webhooks';
import {setupDb} from '../src/db';

import type {
  CheckRunEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
} from '@octokit/webhooks-types';
import type {RestfulOctokit} from '../src/types/rest-endpoint-methods';

import baseCheckRunFixture from './fixtures/check_run.created.json';
import basePullRequestOpenedFixture from './fixtures/pull_request.opened.json';
import basePullRequestReviewSubmittedFixture from './fixtures/pull_request_review.submitted.json';
import listTeamMembersWgInfra from './fixtures/teams.listMembersInOrg.wg-infra.json';
import listTeamMembersWgPerformance from './fixtures/teams.listMembersInOrg.wg-performance.json';
import listTeamMembersWgRuntime from './fixtures/teams.listMembersInOrg.wg-runtime.json';

describe('bundle-size webhooks', () => {
  let mockGithub: DeepMockProxy<RestfulOctokit>;
  let mockLog: DeepMockProxy<Logger>;
  let githubUtils: GitHubUtils;

  const db = inMemoryDbConnect();
  const nodeCache = new NodeCache();

  let checkRunPayload: CheckRunEvent;
  let pullRequestPayload: PullRequestEvent;
  let pullRequestReviewPayload: PullRequestReviewEvent;
  let probot: Probot;

  async function mockListMembersInOrgByTeamSlug_(
    params: OctokitParamsType<'teams', 'listMembersInOrg'>
  ) {
    if (params === undefined) {
      throw new Error('params is undefined');
    }
    expect(params.team_slug).toMatch(/^wg-(infra|performance|runtime)$/);
    return {
      data:
        params.team_slug === 'wg-infra'
          ? listTeamMembersWgInfra
          : params.team_slug === 'wg-performance'
            ? listTeamMembersWgPerformance
            : params.team_slug === 'wg-runtime'
              ? listTeamMembersWgRuntime
              : undefined,
    } as unknown as OctokitResponseType<'teams', 'listMembersInOrg'>;
  }

  beforeAll(async () => {
    await setupDb(db);
  });

  beforeEach(async () => {
    mockGithub = mockDeep<RestfulOctokit>();
    mockLog = mockDeep<Logger>();
    githubUtils = new GitHubUtils(mockGithub, mockLog, nodeCache);

    checkRunPayload = structuredClone(
      baseCheckRunFixture
    ) as unknown as CheckRunEvent;
    pullRequestPayload = structuredClone(
      basePullRequestOpenedFixture
    ) as unknown as PullRequestEvent;
    pullRequestReviewPayload = structuredClone(
      basePullRequestReviewSubmittedFixture
    ) as unknown as PullRequestReviewEvent;

    mockGithub.rest.checks.create.mockResolvedValue({
      data: {
        id: 555555,
        status: 'completed',
      },
    } as OctokitResponseType<'checks', 'create'> & {
      data: {status: 'completed'};
    });
    mockGithub.rest.teams.listMembersInOrg.mockImplementation(
      mockListMembersInOrgByTeamSlug_
    );

    probot = new Probot({
      Octokit: class FakeOctokitFactory {
        static defaults = () =>
          class FakeOctokit {
            auth = () => mockGithub;
          };
      } as unknown as Options['Octokit'],
    });
    await probot.load(app => {
      installGitHubWebhooks(app, db, githubUtils);
    });

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
    vi.restoreAllMocks();
    nodeCache.flushAll();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('pull_request', () => {
    test('create a new pending check when a pull request is opened', async () => {
      await probot.receive({
        id: '1',
        name: 'pull_request',
        payload: pullRequestPayload,
      });

      await expect(db('checks').select('*')).resolves.toEqual([
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

      expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          name: 'ampproject/bundle-size',
          output: expect.objectContaining({
            title: 'Calculating new bundle size for this PR…',
          }),
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

      await probot.receive({
        id: '1',
        name: 'pull_request',
        payload: pullRequestPayload,
      });

      await expect(db('checks').select('*')).resolves.toEqual([
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

      expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          name: 'ampproject/bundle-size',
          output: expect.objectContaining({
            title: 'Calculating new bundle size for this PR…',
          }),
        })
      );
    });

    test('ignore closed (not merged) pull request', async () => {
      pullRequestPayload.action = 'closed';

      await probot.receive({
        id: '1',
        name: 'pull_request',
        payload: pullRequestPayload,
      });
      await expect(db('merges').select('*')).resolves.toEqual([]);

      await probot.receive({
        id: '1',
        name: 'check_run',
        payload: checkRunPayload,
      });

      expect(mockGithub.rest.checks.create).not.toHaveBeenCalled();
    });

    test('skip the check on a merged pull request', async () => {
      Object.assign(pullRequestPayload, {
        action: 'closed',
        pull_request: {
          merged_at: '2019-02-25T20:21:58Z',
          merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355',
        },
      });

      await probot.receive({
        id: '1',
        name: 'pull_request',
        payload: pullRequestPayload,
      });
      await expect(db('merges').select('*')).resolves.toEqual([
        {merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355'},
      ]);

      await probot.receive({
        id: '1',
        name: 'check_run',
        payload: checkRunPayload,
      });
      await expect(db('merges').select('*')).resolves.toEqual([]);

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 68609861,
          conclusion: 'neutral',
          output: expect.objectContaining({
            title: 'Check skipped because this is a merged commit',
          }),
        })
      );
    });

    test('fail when a pull request is reported as merged twice', async () => {
      Object.assign(pullRequestPayload, {
        action: 'closed',
        pull_request: {
          merged_at: '2019-02-25T20:21:58Z',
          merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355',
        },
      });

      await probot.receive({
        id: '1',
        name: 'pull_request',
        payload: pullRequestPayload,
      });

      try {
        await probot.receive({
          id: '1',
          name: 'pull_request',
          payload: pullRequestPayload,
        });
      } catch (e) {
        expect(String(e)).toContain('UNIQUE constraint failed');
      }
    });
  });

  describe('pull_request_review', () => {
    test.each([
      ['with no report_markdown', ''],
      ['with a report_markdown', '* `dist/v0/amp-ad-0.1.js`: Δ +0.34KB'],
    ])(
      'mark a check as successful when a capable user approves the PR %s',
      async (_, reportMarkdown) => {
        await db('checks').insert({
          head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19603,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
          report_markdown: reportMarkdown,
        });

        await probot.receive({
          id: '1',
          name: 'pull_request_review',
          payload: pullRequestReviewPayload,
        });

        expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            conclusion: 'success',
            output: expect.objectContaining({
              title: 'approved by @choumx',
              summary: expect.stringContaining(
                'The bundle size change(s) of this pull request were approved by @choumx'
              ),
            }),
          })
        );
        expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            output: expect.objectContaining({
              summary: expect.stringContaining(reportMarkdown),
            }),
          })
        );
      }
    );

    test('mark a preemptive approval check as successful when a super user approves the PR', async () => {
      pullRequestReviewPayload.review.user!.login = 'rsimha';

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

      await probot.receive({
        id: '1',
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      });

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'approved by @rsimha',
          }),
        })
      );
    });

    test('ignore a preemptive approval', async () => {
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

      await probot.receive({
        id: '1',
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      });

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a non-capable reviewer', async () => {
      await probot.receive({
        id: '1',
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      });

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore a "changes requested" review', async () => {
      pullRequestReviewPayload.review.state = 'changes_requested';

      await probot.receive({
        id: '1',
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      });

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a capable reviewer for small delta', async () => {
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

      await probot.receive({
        id: '1',
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      });

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a capable reviewer for unknown PRs', async () => {
      await probot.receive({
        id: '1',
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      });

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });
  });
});
